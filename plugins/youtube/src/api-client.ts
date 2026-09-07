const API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YtThumbnails {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
}

export interface YtChannel {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    thumbnails?: YtThumbnails;
  };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
    hiddenSubscriberCount?: boolean;
  };
}

export interface YtVideo {
  id: string;
  snippet?: {
    title?: string;
    liveBroadcastContent?: 'live' | 'upcoming' | 'none';
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: YtThumbnails;
  };
  liveStreamingDetails?: {
    actualStartTime?: string;
    concurrentViewers?: string;
  };
}

export interface YtSearchResultItem {
  id?: { channelId?: string; videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    channelId?: string;
    thumbnails?: YtThumbnails;
  };
}

export function pickThumb(thumbs?: YtThumbnails): string | undefined {
  return thumbs?.medium?.url ?? thumbs?.high?.url ?? thumbs?.default?.url;
}

export async function apiGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('key', apiKey);

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as
    | ({ error?: { message?: string } } & Record<string, unknown>)
    | null;

  if (!res.ok) {
    const message =
      body?.error?.message ?? `YouTube API request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export async function searchChannels(
  query: string,
  apiKey: string,
  limit: number,
): Promise<YtSearchResultItem[]> {
  const data = await apiGet<{ items?: YtSearchResultItem[] }>('search', {
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: String(Math.min(Math.max(limit, 1), 25)),
  }, apiKey);
  return data.items ?? [];
}

export async function getChannels(
  apiKey: string,
  opts: { ids?: string[]; handles?: string[] },
): Promise<YtChannel[]> {
  const params: Record<string, string> = {
    part: 'snippet,statistics',
    maxResults: '50',
  };
  if (opts.ids && opts.ids.length > 0) {
    params.id = opts.ids.join(',');
  } else if (opts.handles && opts.handles.length > 0) {
    params.forHandle = opts.handles.join(',');
  } else {
    return [];
  }
  const data = await apiGet<{ items?: YtChannel[] }>('channels', params, apiKey);
  return data.items ?? [];
}

export async function getPlaylistItems(
  playlistId: string,
  apiKey: string,
  limit: number,
): Promise<string[]> {
  const data = await apiGet<{
    items?: { contentDetails?: { videoId?: string } }[];
  }>('playlistItems', {
    part: 'contentDetails',
    playlistId,
    maxResults: String(Math.min(Math.max(limit, 1), 50)),
  }, apiKey);
  return (data.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => typeof id === 'string');
}

export async function getVideos(
  videoIds: string[],
  apiKey: string,
): Promise<YtVideo[]> {
  if (videoIds.length === 0) return [];
  const data = await apiGet<{ items?: YtVideo[] }>('videos', {
    part: 'snippet,liveStreamingDetails',
    id: videoIds.join(','),
  }, apiKey);
  return data.items ?? [];
}

export async function searchLiveVideos(
  channelId: string,
  apiKey: string,
): Promise<YtSearchResultItem[]> {
  const data = await apiGet<{ items?: YtSearchResultItem[] }>('search', {
    part: 'snippet',
    type: 'video',
    channelId,
    eventType: 'live',
    order: 'date',
    maxResults: '1',
  }, apiKey);
  return data.items ?? [];
}

// ponytail: free live probes that do not consume YouTube Data API quota.
// Ongoing live streams often never appear in the uploads playlist, and the
// search fallback costs 100 quota units per call (quota runs out fast with
// frequent polling), so these keep live detection working in those cases.

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// youtube.com/<channel-or-handle>/live renders the active stream's watch page
// (with "isLive":true in the player data) when the channel is broadcasting,
// and the latest video without the live marker when it is not. Fetching it
// uses no YouTube Data API quota.
export interface LiveProbeResult {
  videoId: string;
  isLive: boolean;
}

export async function probeLivePage(
  idOrHandle: string,
): Promise<LiveProbeResult | null> {
  const path = /^UC[\w-]{22}$/.test(idOrHandle)
    ? `channel/${idOrHandle}`
    : `@${idOrHandle.replace(/^@/, '')}`;
  const res = await fetch(`https://www.youtube.com/${path}/live`, {
    redirect: 'follow',
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const urlMatch = res.url.match(/[?&]v=([\w-]{11})/);
  const htmlMatch = html.match(/"videoId":"([\w-]{11})"/);
  const videoId = urlMatch?.[1] ?? htmlMatch?.[1];
  if (!videoId) return null;
  return { videoId, isLive: /"isLive"\s*:\s*true/.test(html) };
}
