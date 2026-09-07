import type {
  AuthStatus,
  CreatorInfo,
  CreatorMetadata,
  CreatorSearchResult,
  HealthStatus,
  LiveStatus,
  Plugin,
  PluginContext,
  PluginSettingValues,
  PluginStatus,
  SettingDef,
  StreamObject,
} from '@rekordly/plugin-sdk';
import manifest from '../manifest.json';
import {
  HelixClient,
  type TwitchChannelSearchItem,
  type TwitchStream,
  type TwitchUser,
} from './helix';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

const BASE = 'https://www.twitch.tv';

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  setupGuide: {
    type: 'guide',
    label: 'How to get a Twitch Client-ID and Secret (free)',
    description:
      'Twitch requires every API caller to register an application. This takes about 2 minutes and is completely free.',
    steps: [
      'Open https://dev.twitch.tv/console in your browser and sign in with your Twitch account.',
      'If you are asked to enable two-factor authentication, do it first under Twitch Settings > Security and Privacy, then return to the console.',
      'Click "Register Your Application".',
      'Name: enter anything unique, e.g. "Rekordly-yourname".',
      'OAuth Redirect URLs: enter http://localhost (this is required by the form but not used for monitoring).',
      'Category: choose "Application Integration", then click Create.',
      'Back on the console dashboard, find your new app and click Manage.',
      'Copy the Client ID shown at the top of the page into the "Client-ID" field below.',
      'Click "New Secret", confirm the dialog, and copy the generated secret into the "Client Secret" field below. The secret is only shown once!',
      'Scroll down and click "Save settings" here. If you ever lose the secret, click "New Secret" again on the Manage page and update it here.',
    ],
  },
  clientId: {
    type: 'text',
    label: 'Client-ID',
    description:
      'Client ID from a free Twitch Developer Console app (dev.twitch.tv/console).',
    defaultValue: '',
    required: true,
  },
  clientSecret: {
    type: 'password',
    label: 'Client Secret',
    description: 'Client secret of the same Twitch app.',
    defaultValue: '',
    required: true,
  },
};

const helix = new HelixClient();

function getClientId(): string {
  const v = ctx?.settings.get('clientId');
  return typeof v === 'string' ? v.trim() : '';
}

function getClientSecret(): string {
  const v = ctx?.settings.get('clientSecret');
  return typeof v === 'string' ? v.trim() : '';
}

function syncCredentials(): void {
  helix.configure(getClientId(), getClientSecret());
}

function stripPrefix(identifier: string): string {
  return identifier.replace(/^twitch:/, '').toLowerCase();
}

function normalizeLogin(raw: string): string {
  const trimmed = raw.replace(/^twitch:/, '').trim().toLowerCase();
  if (/^https?:\/\/(www\.)?twitch\.tv\//.test(trimmed)) {
    try {
      return new URL(trimmed).pathname.split('/').filter(Boolean)[0] ?? trimmed;
    } catch {
      /* fall through */
    }
  }
  return trimmed;
}

function userToCreatorInfo(user: TwitchUser, isLive = false): CreatorInfo {
  return {
    id: `twitch:${user.login.toLowerCase()}`,
    username: user.login.toLowerCase(),
    displayName: user.display_name || user.login,
    avatarUrl: user.profile_image_url,
    profileUrl: `${BASE}/${user.login.toLowerCase()}`,
    bio: user.description || undefined,
    isLive,
    liveUrl: isLive ? `${BASE}/${user.login.toLowerCase()}` : undefined,
  };
}

function searchItemToCreatorInfo(item: TwitchChannelSearchItem): CreatorInfo {
  const login = item.broadcaster_login?.toLowerCase();
  return {
    id: `twitch:${login}`,
    username: login,
    displayName: item.display_name || login,
    avatarUrl: item.thumbnail_url,
    profileUrl: `${BASE}/${login}`,
    isLive: item.is_live,
    liveUrl: item.is_live ? `${BASE}/${login}` : undefined,
  };
}

async function findStream(login: string): Promise<TwitchStream | null> {
  syncCredentials();
  const streams = await helix.getStreams(login);
  return streams[0] ?? null;
}

function streamToLiveStatus(stream: TwitchStream): LiveStatus {
  return {
    isLive: true,
    title: stream.title ?? `Stream is live`,
    thumbnail: stream.thumbnail_url
      ? stream.thumbnail_url
          .replace('{width}', '1280')
          .replace('{height}', '720')
      : undefined,
    viewerCount: stream.viewer_count,
    startedAt: stream.started_at,
    streamUrl: `${BASE}/${stream.user_login}`,
  };
}

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    auth: {
      async getStatus(): Promise<AuthStatus> {
        syncCredentials();
        if (!helix.hasCredentials()) return { authenticated: false };
        try {
          const users = await helix.getUsers({ logins: ['twitch'] });
          return { authenticated: users.length > 0 };
        } catch {
          return { authenticated: false };
        }
      },
      async logout(): Promise<void> {
        helix.invalidateToken();
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim();
        const limit = query.limit ?? 10;
        if (!q) return { creators: [], total: 0 };
        syncCredentials();
        try {
          const items = await helix.searchChannels(q, limit);
          const creators = items
            .filter((item) => item.broadcaster_login)
            .map(searchItemToCreatorInfo);
          return { creators, total: creators.length };
        } catch (e) {
          ctx?.logger.warn(`twitch: search failed: ${e}`);
          return { creators: [], total: 0 };
        }
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const login = normalizeLogin(identifier);
        if (!login) return null;
        syncCredentials();
        try {
          const users = await helix.getUsers({ logins: [login] });
          const user = users[0];
          if (!user) return null;
          const stream = await findStream(user.login).catch(() => null);
          return userToCreatorInfo(user, stream !== null);
        } catch (e) {
          ctx?.logger.warn(`twitch: getCreator failed for ${login}: ${e}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const login = stripPrefix(identifier);
        ctx?.logger.debug(`twitch: checking live status for ${login}`);
        try {
          const stream = await findStream(login);
          if (!stream) return { isLive: false };
          return streamToLiveStatus(stream);
        } catch (e) {
          ctx?.logger.debug(`twitch: live check failed for ${login}: ${e}`);
          return { isLive: false };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const login = stripPrefix(identifier);
        syncCredentials();
        const stream = await findStream(login);
        if (!stream) throw new Error(`${login} is not live on Twitch`);

        let displayName = stream.user_name || login;
        try {
          const users = await helix.getUsers({ logins: [login] });
          if (users[0]?.display_name) displayName = users[0].display_name;
        } catch {
          /* keep fallback name */
        }

        return {
          creatorId: `twitch:${login}`,
          creatorName: displayName,
          platformId: 'twitch',
          title: stream.title ?? `${displayName} live on Twitch`,
          streamUrl: `${BASE}/${login}`,
          thumbnail: stream.thumbnail_url
            ? stream.thumbnail_url
                .replace('{width}', '1280')
                .replace('{height}', '720')
            : undefined,
          qualityOptions: [{ id: 'best', label: 'Best', format: 'hls', isBest: true }],
          metadata: {
            category: stream.game_name || 'Twitch',
            tags: ['live'],
          },
          startedAt: stream.started_at ?? new Date().toISOString(),
        };
      },
    },

    settings: {
      getSchema(): Record<string, SettingDef> {
        return SETTINGS_SCHEMA;
      },
      async validate(values: PluginSettingValues): Promise<{
        valid: boolean;
        errors?: Record<string, string>;
      }> {
        const id = values['clientId'];
        const secret = values['clientSecret'];
        const errors: Record<string, string> = {};
        if (typeof id !== 'string' || !id.trim()) {
          errors['clientId'] = 'A Client-ID is required.';
        }
        if (typeof secret !== 'string' || !secret.trim()) {
          errors['clientSecret'] = 'A Client Secret is required.';
        }
        return {
          valid: Object.keys(errors).length === 0,
          errors: Object.keys(errors).length > 0 ? errors : undefined,
        };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        syncCredentials();
        if (!helix.hasCredentials()) {
          return {
            healthy: false,
            message: 'Client-ID / Client Secret not configured',
            latencyMs: 0,
          };
        }
        try {
          await helix.getUsers({ logins: ['twitch'] });
          return {
            healthy: true,
            message: 'Twitch Helix API reachable',
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return {
            healthy: false,
            message: String(e instanceof Error ? e.message : e),
            latencyMs: Date.now() - start,
          };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const login = stripPrefix(identifier);
        try {
          syncCredentials();
          const users = await helix.getUsers({ logins: [login] });
          const user = users[0];
          if (!user) return { displayName: login };
          return {
            displayName: user.display_name || login,
            avatarUrl: user.profile_image_url,
            bio: user.description || undefined,
            website: `${BASE}/${login}`,
          };
        } catch {
          return { displayName: login };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('twitch: initializing');
    syncCredentials();
    status.state = 'ready';
  },

  async start(): Promise<void> {
    status.state = 'ready';
  },

  async stop(): Promise<void> {
    status.state = 'disabled';
  },

  async cleanup(): Promise<void> {
    status.state = 'installed';
    helix.invalidateToken();
    ctx = null;
  },
};

export default plugin;
