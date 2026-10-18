import type { CreatorRepo } from '@rekordly/database';
import type { PluginManager } from '@rekordly/core';
import type { Logger } from '@rekordly/shared';
import type { CreatorInfo } from '@rekordly/plugin-sdk';

/**
 * ponytail: profile-photo plumbing. The manual Add Creator form starts with
 * no picture at all, but every plugin can resolve richer profiles via its
 * `creatorSearch.getCreator()` capability. These helpers surface that data
 * at two moments — while the Add form is open (IPC `creators:lookup`) and
 * after each successful live-status check (monitoring `creator-checked`) —
 * so missing/stale avatars converge on the real photo without user effort.
 */

/** Successful refresh cadence — profile photos change rarely (a week). */
const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Retry window after an upstream failure or a lookup without a photo —
 * short enough that a transient WAF/network hiccup doesn't block the photo
 * for an hour; every successful live check gets a fresh chance. */
const AVATAR_RETRY_MS = 2 * 60 * 1000;
/** Plugins without creatorSearch can never answer — throttle much harder. */
const AVATAR_NO_CAPABILITY_MS = 24 * 60 * 60 * 1000;
/** Hard cap on a single plugin profile lookup — plugins do their own HTTP
 * with redirects/retries; without this a wedged socket keeps the Add form
 * spinning ("Looking up profile…") for minutes. */
const PROFILE_LOOKUP_TIMEOUT_MS = 12_000;

/** monitorId → epoch ms of the next allowed refresh attempt. */
const nextAttemptAt = new Map<string, number>();

/**
 * ponytail: some CDNs answer protocol-relative URLs ("//img.x/y") which break
 * <img> in the renderer (no scheme). Force https and reject non-http junk.
 */
export function sanitizeAvatarUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (url === '') return null;
  const absolute = url.startsWith('//') ? `https:${url}` : url;
  return /^https?:\/\//i.test(absolute) ? absolute : null;
}

function getCreatorWithTimeout(
  plugins: PluginManager,
  pluginId: string,
  monitorId: string,
): Promise<CreatorInfo | null> {
  const search = plugins.get(pluginId)?.instance?.capabilities.creatorSearch;
  if (search === undefined) return Promise.resolve(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROFILE_LOOKUP_TIMEOUT_MS);
  });
  return Promise.race([
    search
      .getCreator(monitorId)
      .catch(() => null) // plugin errors are non-fatal (offline/WAF hiccups)
      .finally(() => {
        if (timer !== undefined) clearTimeout(timer);
      }),
    timeout,
  ]);
}

/**
 * Best-effort profile lookup through a plugin's creatorSearch capability.
 * Plugins accept the monitor id (they strip their own `<pluginId>:` prefix).
 * Never throws and never hangs: upstream flakiness must not break adds or
 * live checks — a timeout resolves to null instead.
 */
export async function lookupCreatorInfo(
  plugins: PluginManager,
  pluginId: string,
  monitorId: string,
): Promise<CreatorInfo | null> {
  return getCreatorWithTimeout(plugins, pluginId, monitorId);
}

export interface RefreshCreatorAvatarDeps {
  plugins: PluginManager;
  creatorRepo: CreatorRepo;
  logger: Logger;
}

/**
 * Backfill/refresh a creator's stored avatarUrl (and profileUrl when the
 * creator has none yet) from the platform, rate-limited per monitor id.
 * Intended to fire on every successful `creator-checked` monitoring event.
 */
export async function refreshCreatorAvatar(
  deps: RefreshCreatorAvatarDeps,
  creator: {
    id: string;
    pluginId: string;
    externalId: string;
    avatarUrl?: string | null;
    profileUrl?: string | null;
  },
): Promise<void> {
  const monitorId = `${creator.pluginId}:${creator.externalId}`;
  const now = Date.now();
  if ((nextAttemptAt.get(monitorId) ?? 0) > now) return;
  nextAttemptAt.set(monitorId, now);

  const search = deps.plugins.get(creator.pluginId)?.instance?.capabilities.creatorSearch;
  if (search === undefined) {
    nextAttemptAt.set(monitorId, now + AVATAR_NO_CAPABILITY_MS);
    return;
  }

  // Hard timeout: a wedged plugin HTTP call must never stall the check
  // pipeline — resolve to null and retry on the next check (2 min).
  const info = await getCreatorWithTimeout(deps.plugins, creator.pluginId, monitorId);
  if (info === null) {
    deps.logger.debug({ monitorId }, 'creator avatar lookup failed (upstream error or timeout)');
  }

  const avatarUrl = sanitizeAvatarUrl(info?.avatarUrl);
  if (avatarUrl === null) {
    nextAttemptAt.set(monitorId, now + AVATAR_RETRY_MS);
    return;
  }
  nextAttemptAt.set(monitorId, now + AVATAR_TTL_MS);
  if (avatarUrl === creator.avatarUrl) return;

  const patch: Parameters<CreatorRepo['update']>[1] = { avatarUrl };
  const profileUrl = typeof info?.profileUrl === 'string' && info.profileUrl !== '' ? info.profileUrl : null;
  if (profileUrl !== null && (creator.profileUrl ?? '') === '') {
    patch.profileUrl = profileUrl;
  }

  try {
    deps.creatorRepo.update(creator.id, patch);
    deps.logger.info({ creatorId: creator.id, pluginId: creator.pluginId }, 'creator avatar refreshed from platform');
  } catch (err) {
    deps.logger.warn({ err, creatorId: creator.id }, 'creator avatar update failed');
  }
}
