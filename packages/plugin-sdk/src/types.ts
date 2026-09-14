/**
 * Domain types shared by every plugin capability.
 * The host core only consumes these shapes — it never knows platform details.
 */

export interface CreatorInfo {
  /** Stable identifier used by the host to reference this creator. */
  id: string;
  /** Platform username, e.g. the URL slug. */
  username: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl?: string;
  bio?: string;
  followerCount?: number;
  isLive?: boolean;
  liveUrl?: string;
}

export interface CreatorSearchQuery {
  query: string;
  limit?: number;
}

export interface CreatorSearchResult {
  creators: CreatorInfo[];
  total?: number;
}

export interface LiveStatus {
  isLive: boolean;
  title?: string;
  thumbnail?: string;
  viewerCount?: number;
  startedAt?: string;
  /** Present when live so the host can offer immediate recording. */
  streamUrl?: string;
  /**
   * ponytail: True when the check could not reach the platform at all
   * (transport failure / site unreachable) — the answer is NEITHER live
   * NOR ended. The host must not treat this as "creator went offline"
   * (that event finalizes active recordings) and should simply retry.
   * Omit for definitive answers (state data, playlist 404).
   */
  unknown?: boolean;
}

export interface CreatorMetadata {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  followerCount?: number;
  location?: string;
  website?: string;
  joinedAt?: string;
  links?: string[];
}

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
  expiresAt?: string;
}

export interface HealthStatus {
  healthy: boolean;
  /** Human-readable summary, e.g. "reachable", "session expired". */
  message?: string;
  latencyMs?: number;
  /** Set by the host when the check completes. */
  checkedAt?: string;
}

/** Definition of one plugin setting surfaced in the Plugin Manager UI. */
export interface SettingDef {
  type: 'text' | 'password' | 'number' | 'boolean' | 'select' | 'guide';
  label: string;
  description?: string;
  defaultValue?: string | number | boolean;
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  /** Ordered instructions rendered for settings of type 'guide'. */
  steps?: readonly string[];
}

export type PluginSettingValues = Record<string, string | number | boolean>;
