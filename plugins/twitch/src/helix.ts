const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_BASE = 'https://api.twitch.tv/helix';

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  description?: string;
  profile_image_url?: string;
  view_count?: number;
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title?: string;
  viewer_count?: number;
  started_at?: string;
  thumbnail_url?: string;
  game_name?: string;
}

export interface TwitchChannelSearchItem {
  id: string;
  broadcaster_login: string;
  display_name: string;
  is_live: boolean;
  thumbnail_url?: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
}

export class HelixClient {
  private clientId = '';
  private clientSecret = '';
  private token: string | null = null;
  private tokenExpiresAt = 0;

  configure(clientId: string, clientSecret: string): void {
    const changed =
      clientId !== this.clientId || clientSecret !== this.clientSecret;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    if (changed) {
      this.token = null;
      this.tokenExpiresAt = 0;
    }
  }

  hasCredentials(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  private async fetchToken(): Promise<string> {
    if (!this.hasCredentials()) {
      throw new Error('Twitch Client-ID and Client Secret are not configured');
    }
    const url = new URL(TOKEN_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('client_secret', this.clientSecret);
    url.searchParams.set('grant_type', 'client_credentials');

    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!res.ok || !body?.access_token) {
      throw new Error(
        body?.message ?? `Twitch token request failed (HTTP ${res.status})`,
      );
    }
    this.token = body.access_token;
    // ponytail: refresh a minute early to avoid mid-request expiry
    this.tokenExpiresAt = Date.now() + (body.expires_in ?? 3600) * 1000 - 60_000;
    return this.token;
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }
    return this.fetchToken();
  }

  invalidateToken(): void {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async get<T>(
    path: string,
    params: Record<string, string>,
    retryOn401 = true,
  ): Promise<T> {
    const token = await this.getToken();
    const url = new URL(`${HELIX_BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
      headers: {
        'Client-Id': this.clientId,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401 && retryOn401) {
      this.invalidateToken();
      return this.get<T>(path, params, false);
    }
    const body = (await res.json().catch(() => null)) as
      | ({ data?: T } & { error?: string; message?: string })
      | null;
    if (!res.ok) {
      throw new Error(
        body?.message ?? `Twitch Helix request failed (HTTP ${res.status})`,
      );
    }
    return (body?.data ?? ([] as unknown)) as T;
  }

  async getUsers(opts: {
    logins?: string[];
    ids?: string[];
  }): Promise<TwitchUser[]> {
    const params: Record<string, string> = {};
    if (opts.logins && opts.logins.length > 0) {
      params.login = opts.logins.join(',');
    } else if (opts.ids && opts.ids.length > 0) {
      params.id = opts.ids.join(',');
    } else {
      return [];
    }
    return this.get<TwitchUser[]>('users', params);
  }

  async getStreams(login: string): Promise<TwitchStream[]> {
    return this.get<TwitchStream[]>('streams', { user_login: login });
  }

  async searchChannels(query: string, limit: number): Promise<TwitchChannelSearchItem[]> {
    return this.get<TwitchChannelSearchItem[]>('search/channels', {
      query,
      live_only: 'false',
      first: String(Math.min(Math.max(limit, 1), 25)),
    });
  }
}
