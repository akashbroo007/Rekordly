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
} from '@rekordly/plugin-sdk';
import manifest from '../manifest.json';
import { MOCK_CREATORS, buildMockStream, isLiveNow } from './data';

/**
 * Example plugin: validates the Rekordly plugin architecture end to end.
 * Everything is mocked; no real streaming platform is contacted.
 */

const status: PluginStatus = { state: 'installed' };

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  defaultQuality: {
    type: 'select',
    label: 'Default quality',
    description: 'Quality used when starting a recording.',
    defaultValue: 'best',
    options: [
      { value: 'best', label: 'Best' },
      { value: '720p', label: '720p' },
      { value: '480p', label: '480p' },
    ],
  },
  notifyWhenLive: {
    type: 'boolean',
    label: 'Notify when live',
    description: 'Show a notification when a followed creator goes live.',
    defaultValue: true,
  },
  refreshRateMinutes: {
    type: 'number',
    label: 'Refresh interval (minutes)',
    description: 'How often creator status is checked.',
    defaultValue: 5,
  },
};

function searchCreators(query: string, limit = 10): CreatorSearchResult {
  const q = query.trim().toLowerCase();
  const creators = MOCK_CREATORS.filter(
    (creator) => q === '' || creator.username.includes(q) || creator.displayName.toLowerCase().includes(q),
  ).slice(0, limit);
  return { creators, total: creators.length };
}

function getCreator(identifier: string): CreatorInfo | null {
  return MOCK_CREATORS.find((creator) => creator.id === identifier || creator.username === identifier) ?? null;
}

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    auth: {
      async getStatus(): Promise<AuthStatus> {
        return { authenticated: true, username: 'mock-user' };
      },
    },
    creatorSearch: {
      async search(query) {
        return searchCreators(query.query, query.limit);
      },
      async getCreator(identifier) {
        return getCreator(identifier);
      },
    },
    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const creator = getCreator(identifier);
        if (creator === null) {
          return { isLive: false };
        }
        const live = isLiveNow(creator.username);
        return {
          isLive: live,
          title: live ? `${creator.displayName} is live` : undefined,
          viewerCount: live ? 1_234 : undefined,
          startedAt: live ? new Date().toISOString() : undefined,
          streamUrl: live ? `https://cdn.mock.example/hls/${creator.username}/master.m3u8` : undefined,
        };
      },
    },
    streamExtraction: {
      async extractStream(identifier) {
        const creator = getCreator(identifier);
        if (creator === null) {
          throw new Error(`Unknown creator: ${identifier}`);
        }
        if (!isLiveNow(creator.username)) {
          throw new Error(`${creator.username} is not live`);
        }
        return buildMockStream(creator.username);
      },
    },
    settings: {
      getSchema(): Record<string, SettingDef> {
        return SETTINGS_SCHEMA;
      },
      async validate(values: PluginSettingValues) {
        const errors: Record<string, string> = {};
        const refresh = values['refreshRateMinutes'];
        if (typeof refresh === 'number' && (refresh < 1 || refresh > 60)) {
          errors['refreshRateMinutes'] = 'Must be between 1 and 60 minutes.';
        }
        return { valid: Object.keys(errors).length === 0, errors };
      },
    },
    healthCheck: {
      async check(): Promise<HealthStatus> {
        return { healthy: true, message: 'Mock platform reachable', latencyMs: 12 };
      },
    },
    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const creator = getCreator(identifier);
        return {
          displayName: creator?.displayName,
          bio: creator?.bio,
          followerCount: creator?.followerCount,
          links: [creator?.profileUrl].filter((link): link is string => link !== undefined),
        };
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    context.logger.info('initializing mock platform plugin');
    const quality = await context.settings.get('defaultQuality');
    context.logger.info('plugin configuration loaded', { defaultQuality: quality ?? 'best' });
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
  },
};

export default plugin;
