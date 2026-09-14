import * as ed25519 from '@noble/ed25519';
import { base64url } from '@scure/base';
import { z } from 'zod';
import type { Logger } from '@rekordly/shared';
import type { SettingsService } from './settings-service';
import type {
  LicenseStatusDto,
  LicenseActivateResultDto,
  LicenseLimitsDto,
} from '@rekordly/shared';

/**
 * ponytail: Rekordly Pro licensing.
 *
 * A license is a compact signed token: base64url(JSON payload) + '.' +
 * base64url(Ed25519 signature). The private key never ships with the app —
 * it lives offline (keygen CLI / fulfillment worker). The app only holds the
 * embedded PUBLIC key, so a license can be verified fully offline:
 *
 *   no account, no server, no telemetry.
 *
 * Trial keys are identical except payload.tier = 'trial' and payload.exp is
 * set 7 days out; the free tier is what you get when no valid key is stored.
 */

/** Ed25519 public key (hex). Replace with the key matching your private key. */
export const LICENSE_PUBLIC_KEY = 'REPLACE_WITH_ED25519_PUBLIC_KEY_HEX';

// @noble/ed25519 v3 requires the SHA-512 implementation to be injected.
// Lazy: node:crypto is only loaded when a token is actually verified.
let sha512Injected = false;
function ensureSha512(): void {
  if (sha512Injected) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  ed25519.hashes.sha512 = (...messages: Uint8Array[]) => {
    const hash = createHash('sha512');
    for (const message of messages) hash.update(message);
    return hash.digest();
  };
  sha512Injected = true;
}

const LICENSE_PAYLOAD_SCHEMA = z.object({
  tier: z.enum(['pro', 'trial']),
  email: z.string().email(),
  /** ISO issued-at. */
  iat: z.string(),
  /** ISO expiry — required for trial, absent for lifetime Pro. */
  exp: z.string().optional(),
});

export type LicensePayload = z.infer<typeof LICENSE_PAYLOAD_SCHEMA>;

/** Settings key the raw license token is persisted under. */
export const LICENSE_SETTINGS_KEY = 'licenseKey';

export interface LicenseServiceDeps {
  settings: SettingsService;
  logger: Logger;
  /** Injectable clock for tests. */
  now?: () => Date;
}

export const FREE_LIMITS: LicenseLimitsDto = {
  maxConcurrent: 5,
  maxAutoRecordCreators: 2,
  maxRecordingMinutes: 15,
};

export const PRO_LIMITS: LicenseLimitsDto = {
  maxConcurrent: null,
  maxAutoRecordCreators: null,
  maxRecordingMinutes: null,
};

export class LicenseService {
  private readonly changeListeners = new Set<(status: LicenseStatusDto) => void>();

  constructor(private readonly deps: LicenseServiceDeps) {}

  /** Subscribe to tier changes (activation/deactivation/expiry detection). */
  onChanged(listener: (status: LicenseStatusDto) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChanged(status: LicenseStatusDto): void {
    for (const listener of this.changeListeners) {
      try {
        listener(status);
      } catch (error) {
        this.deps.logger.error({ error }, 'license change listener failed');
      }
    }
  }

  getStatus(): LicenseStatusDto {
    const now = this.deps.now?.() ?? new Date();
    const raw = this.deps.settings.getAll().licenseKey;
    if (!raw) {
      return { tier: 'free', expired: false, limits: FREE_LIMITS };
    }

    const payload = this.verifyToken(raw);
    if (!payload) {
      this.deps.logger.warn('stored license key failed verification — treating as free');
      return { tier: 'free', expired: false, limits: FREE_LIMITS };
    }

    if (payload.exp) {
      const expiry = new Date(payload.exp);
      if (expiry.getTime() <= now.getTime()) {
        const trial = payload.tier === 'trial';
        return {
          tier: 'free',
          expired: true,
          email: payload.email,
          expiresAt: payload.exp,
          trialDaysLeft: trial ? 0 : undefined,
          limits: FREE_LIMITS,
        };
      }
      const trialDaysLeft =
        payload.tier === 'trial'
          ? Math.max(
              0,
              Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000),
            )
          : undefined;
      return {
        tier: payload.tier,
        email: payload.email,
        expiresAt: payload.exp,
        trialDaysLeft,
        expired: false,
        limits: PRO_LIMITS,
      };
    }

    // Lifetime Pro.
    return {
      tier: 'pro',
      email: payload.email,
      expired: false,
      limits: PRO_LIMITS,
    };
  }

  activate(key: string): LicenseActivateResultDto {
    const trimmed = key.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: 'Enter a license key.' };
    }
    const payload = this.verifyToken(trimmed);
    if (!payload) {
      return {
        ok: false,
        error: 'That license key is not valid. Check for typos and try again.',
      };
    }
    this.deps.settings.set({ licenseKey: trimmed });
    this.deps.logger.info(
      { tier: payload.tier, email: payload.email },
      'license activated',
    );
    const status = this.getStatus();
    this.notifyChanged(status);
    return { ok: true, status };
  }

  deactivate(): LicenseStatusDto {
    this.deps.settings.set({ licenseKey: null });
    this.deps.logger.info('license deactivated');
    const status = this.getStatus();
    this.notifyChanged(status);
    return status;
  }

  /**
   * Verify a signed license token. Returns the parsed payload or null when
   * the token is malformed, tampered with, or signed by a foreign key.
   */
  verifyToken(token: string): LicensePayload | null {
    const separator = token.indexOf('.');
    if (separator <= 0 || separator === token.length - 1) {
      return null;
    }
    const payloadPart = token.slice(0, separator);
    const signaturePart = token.slice(separator + 1);

    let message: Uint8Array;
    let signature: Uint8Array;
    try {
      message = base64url.decode(payloadPart);
      signature = base64url.decode(signaturePart);
    } catch {
      return null;
    }

    let publicKey: Uint8Array;
    try {
      publicKey = hexToBytes(LICENSE_PUBLIC_KEY);
    } catch {
      this.deps.logger.error('LICENSE_PUBLIC_KEY is not valid hex');
      return null;
    }

    let ok: boolean;
    try {
      ensureSha512();
      ok = ed25519.verify(signature, message, publicKey);
    } catch {
      return null;
    }
    if (!ok) {
      return null;
    }

    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(message)) as unknown;
    } catch {
      return null;
    }
    const parsed = LICENSE_PAYLOAD_SCHEMA.safeParse(json);
    return parsed.success ? parsed.data : null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('invalid hex');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)!;
  }
  return bytes;
}
