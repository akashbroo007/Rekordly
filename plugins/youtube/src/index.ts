import type {
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
  getChannels,
  getPlaylistItems,
  getVideos,
  pickThumb,
  probeLivePage,
  searchChannels,
  searchLiveVideos,
  type YtChannel,
  type YtVideo,
} from './api-client';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

const WATCH_URL = 'https://www.youtube.com/watch?v=';

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  setupGuide: {
    type: 'guide',
    label: 'How to get a YouTube Data API v3 key (free)',
    description:
      'The free tier includes 10,000 quota units per day. A live-status check costs about 2 units, so one key can comfortably monitor dozens of channels.',
    steps: [
      'Open https://console.cloud.google.com/ in your browser and sign in with any Google account.',
      'Click the project dropdown in the top bar and select "New project". Name it (e.g. "Rekordly") and click Create.',
      'With the new project selected, open the navigation menu and go to "APIs & Services > Library".',
      'Search for "YouTube Data API v3", open it from the results and click Enable.',
      'Go to "APIs & Services > Credentials" and click "+ Create credentials", then choose "API key".',
      'Copy the generated key, paste it into the "YouTube Data API v3 key" field below and click "Save settings".',
      'Recommended: on the Credentials page, edit your key and under "API restrictions" restrict it to "YouTube Data API v3" only.',
      'If you see quota errors later, wait until midnight Pacific Time (quota resets daily) or create an additional project.',
    ],
  },
  apiKey: {
    type: 'password',
    label: 'YouTube Data API v3 key',
    description:
      'Free API key from Google Cloud Console (enable "YouTube Data API v3"). Used to check channel live status cheaply.',
    defaultValue: '',
    required: true,
  },
};

function getApiKey(): string {
  const v = ctx?.settings.get('apiKey');
  return typeof v === 'string' ? v.trim() : '';
}

function stripPrefix(identifier: string): string {
  return identifier.replace(/^youtube:/, '');
}

const uploadsPlaylistCache = new Map<string, string>();
const channelIdCache = new Map<string, string>();

// ponytail: monitoring passes whatever external id the user entered; accept
// UC... ids directly and resolve @handles to channel ids (cached) otherwise.
async function resolveChannelId(raw: string): Promise<string> {
  if (/^UC[\w-]{22}$/.test(raw)) return raw;
  const cached = channelIdCache.get(raw);
  if (cached) return cached;
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('YouTube API key is not configured');
  const handle = raw.startsWith('@') ? raw : `@${raw}`;
  const channels = await getChannels(apiKey, { handles: [handle] });
  const channel = channels[0];
  if (!channel) throw new Error(`YouTube channel not found: ${raw}`);
  channelIdCache.set(raw, channel.id);
  return channel.id;
}

// ponytail: default uploads playlist id is 'UU' + channelId minus the 'UC' prefix
function resolveUploadsPlaylist(channelId: string): string {
  if (channelId.startsWith('UC') && channelId.length > 2) {
    return `UU${channelId.slice(2)}`;
  }
  return channelId;
}

async function findLiveVideo(idOrHandle: string): Promise<YtVideo | null> {
  const apiKey = getApiKey();

  // 1. cheap uploads-playlist probe (~2 quota units) for UC... channel ids
  if (apiKey && /^UC[\w-]{22}$/.test(idOrHandle)) {
    let playlistId = uploadsPlaylistCache.get(idOrHandle);
    if (!playlistId) {
      playlistId = resolveUploadsPlaylist(idOrHandle);
      uploadsPlaylistCache.set(idOrHandle, playlistId);
    }

    try {
      const videoIds = await getPlaylistItems(playlistId, apiKey, 3);
      const videos = await getVideos(videoIds, apiKey);
      const live = videos.find(
        (v) => v.snippet?.liveBroadcastContent === 'live',
      );
      if (live) return live;
    } catch (e) {
      ctx?.logger.warn(
        `youtube: uploads playlist check failed for ${idOrHandle}: ${e}`,
      );
    }
  }

  // 2. free /live page probe (no quota) — ongoing live streams often never
  //    appear in the uploads playlist, so check the channel page directly.
  try {
    const probe = await probeLivePage(idOrHandle);
    if (probe?.isLive) {
      if (apiKey) {
        try {
          const videos = await getVideos([probe.videoId], apiKey);
          const live = videos.find(
            (v) => v.snippet?.liveBroadcastContent === 'live',
          );
          if (live) return live;
          // API says the video is not live -> trust the API
          return null;
        } catch (e) {
          // API verification failed (e.g. quota exhausted) — the page already
          // confirmed liveness, so proceed with the minimal video object
          ctx?.logger.warn(
            `youtube: live video lookup failed for ${probe.videoId}: ${e}`,
          );
          return { id: probe.videoId };
        }
      }
      // no API key: the page's live marker is the only signal available
      return { id: probe.videoId };
    }
    if (probe) return null; // page resolved to a non-live video -> offline
  } catch (e) {
    ctx?.logger.warn(`youtube: /live page probe failed for ${idOrHandle}: ${e}`);
  }

  // 3. last resort: dedicated live search (costs 100 quota units)
  if (apiKey) {
    const channelId = await resolveChannelId(idOrHandle);
    const items = await searchLiveVideos(channelId, apiKey);
    const videoId = items[0]?.id?.videoId;
    if (!videoId) return null;
    const videos = await getVideos([videoId], apiKey);
    return videos.find((v) => v.snippet?.liveBroadcastContent === 'live') ?? null;
  }

  return null;
}

function channelToCreatorInfo(channel: YtChannel): CreatorInfo {
  const id = channel.id;
  const customUrl = channel.snippet?.customUrl;
  const username = customUrl ? customUrl.replace(/^@/, '') : id;
  return {
    id: `youtube:${id}`,
    username,
    displayName: channel.snippet?.title ?? username,
    avatarUrl: pickThumb(channel.snippet?.thumbnails),
    profileUrl: `https://www.youtube.com/channel/${id}`,
    bio: channel.snippet?.description,
    followerCount: channel.statistics?.subscriberCount
      ? parseInt(channel.statistics.subscriberCount, 10)
      : undefined,
  };
}

function parseSubscriberCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim();
        const limit = query.limit ?? 10;
        const apiKey = getApiKey();
        if (!apiKey || !q) return { creators: [], total: 0 };
        try {
          const items = await searchChannels(q, apiKey, limit);
          const ids = items
            .map((item) => item.id?.channelId)
            .filter((id): id is string => typeof id === 'string');
          if (ids.length === 0) return { creators: [], total: 0 };
          const channels = await getChannels(apiKey, { ids });
          const creators = channels.map(channelToCreatorInfo);
          return { creators, total: creators.length };
        } catch (e) {
          ctx?.logger.warn(`youtube: search failed: ${e}`);
          return { creators: [], total: 0 };
        }
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const raw = stripPrefix(identifier).trim();
        if (!raw) return null;
        const apiKey = getApiKey();
        if (!apiKey) return null;
        try {
          if (/^UC[\w-]{22}$/.test(raw)) {
            const channels = await getChannels(apiKey, { ids: [raw] });
            return channels[0] ? channelToCreatorInfo(channels[0]) : null;
          }
          const handle = raw.startsWith('@') ? raw : `@${raw}`;
          const channels = await getChannels(apiKey, { handles: [handle] });
          return channels[0] ? channelToCreatorInfo(channels[0]) : null;
        } catch (e) {
          ctx?.logger.warn(`youtube: getCreator failed for ${raw}: ${e}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const raw = stripPrefix(identifier);
        ctx?.logger.debug(`youtube: checking live status for ${raw}`);
        try {
          // pass the raw id/handle: findLiveVideo handles @handles without
          // needing the API key, so detection works even unconfigured
          const video = await findLiveVideo(raw);
          if (!video) return { isLive: false };
          const viewers = video.liveStreamingDetails?.concurrentViewers;
          return {
            isLive: true,
            title: video.snippet?.title ?? `${raw} is live`,
            thumbnail: pickThumb(video.snippet?.thumbnails),
            viewerCount: viewers ? parseInt(viewers, 10) : undefined,
            startedAt: video.liveStreamingDetails?.actualStartTime,
            streamUrl: `${WATCH_URL}${video.id}`,
          };
        } catch (e) {
          ctx?.logger.warn(`youtube: live check failed for ${raw}: ${e}`);
          return { isLive: false };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const raw = stripPrefix(identifier);
        const video = await findLiveVideo(raw);
        if (!video) throw new Error(`No active livestream found for ${raw}`);
        const channelId = await resolveChannelId(raw).catch(() => raw);

        let displayName = video.snippet?.channelTitle ?? channelId;
        try {
          const apiKey = getApiKey();
          const channels = await getChannels(apiKey, { ids: [channelId] });
          if (channels[0]?.snippet?.title) {
            displayName = channels[0].snippet.title;
          }
        } catch {
          /* keep fallback name */
        }

        return {
          creatorId: `youtube:${raw}`,
          creatorName: displayName,
          platformId: 'youtube',
          title: video.snippet?.title ?? `${displayName} live on YouTube`,
          streamUrl: `${WATCH_URL}${video.id}`,
          thumbnail: pickThumb(video.snippet?.thumbnails),
          qualityOptions: [{ id: 'best', label: 'Best', format: 'hls', isBest: true }],
          metadata: {
            category: 'YouTube',
            tags: ['live'],
          },
          startedAt:
            video.liveStreamingDetails?.actualStartTime ??
            new Date().toISOString(),
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
        const key = values['apiKey'];
        const valid = typeof key === 'string' && key.trim().length > 0;
        return {
          valid,
          errors: valid ? undefined : { apiKey: 'An API key is required.' },
        };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        const apiKey = getApiKey();
        if (!apiKey) {
          return { healthy: false, message: 'API key not configured', latencyMs: 0 };
        }
        try {
          await getVideos(['dQw4w9WgXcQ'], apiKey);
          return {
            healthy: true,
            message: 'YouTube Data API reachable',
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
        const channelId = stripPrefix(identifier);
        try {
          const apiKey = getApiKey();
          const channels = await getChannels(apiKey, { ids: [channelId] });
          const channel = channels[0];
          if (!channel) return { displayName: channelId };
          return {
            displayName: channel.snippet?.title ?? channelId,
            avatarUrl: pickThumb(channel.snippet?.thumbnails),
            bio: channel.snippet?.description,
            followerCount: parseSubscriberCount(
              channel.statistics?.subscriberCount,
            ),
            website: `https://www.youtube.com/channel/${channelId}`,
          };
        } catch {
          return { displayName: channelId };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('youtube: initializing');
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
    uploadsPlaylistCache.clear();
    channelIdCache.clear();
    ctx = null;
  },
};

export default plugin;
