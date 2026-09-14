import type { LicenseStatusDto, LicenseLimitsDto } from '@rekordly/shared';
import { FREE_LIMITS, PRO_LIMITS, type LicenseService } from './license-service';

/**
 * ponytail: single source of truth for what each tier may do. Gates read
 * from Entitlements — never from the license status directly — so tier
 * rules live in exactly one place.
 */

export type TierLimits = Required<{ [K in keyof LicenseLimitsDto]: number | null }>;

export interface Entitlements {
  tier: LicenseStatusDto['tier'];
  maxConcurrent: number;
  maxAutoRecordCreators: number;
  maxRecordingMinutes: number;
  isPro: boolean;
}

export function getEntitlements(status: LicenseStatusDto): Entitlements {
  const isPro = status.tier === 'pro' || status.tier === 'trial';
  return {
    tier: status.tier,
    isPro,
    maxConcurrent: status.limits.maxConcurrent ?? Number.POSITIVE_INFINITY,
    maxAutoRecordCreators:
      status.limits.maxAutoRecordCreators ?? Number.POSITIVE_INFINITY,
    maxRecordingMinutes:
      status.limits.maxRecordingMinutes ?? Number.POSITIVE_INFINITY,
  };
}

/** Free-tier limits, exported for UI copy and settings clamping. */
export { FREE_LIMITS, PRO_LIMITS };

/** Which service resolves the current tier — injected to avoid cycles. */
export interface EntitlementsSource {
  getLicenseStatus(): LicenseStatusDto;
}

export function createEntitlementsSource(license: LicenseService): EntitlementsSource {
  return {
    getLicenseStatus: () => license.getStatus(),
  };
}
