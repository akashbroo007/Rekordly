/**
 * Camsoda API access.
 *
 * Two sources, both plain HTTP (no browser automation needed):
 *
 * 1. `GET /api/v1/video/vtoken/{username}?username=guest_{rand}` — tiny JSON
 *    describing the live broadcast: {status, stream_name, token, edge_servers,
 *    width, height, quality_renditions}. The authoritative, cheap polling
 *    endpoint used by the site's own player.
 *    - status "online" + non-empty edge_servers  -> publicly recordable
 *    - status "private" (edge_servers empty)     -> private show, not recordable
 *    - {status: 0, message: "No broadcaster found"} -> no such creator
 *
 * 2. Room page SSR preloaded state (`<script id="__PRELOADED_STATE__">`) —
 *    carries everything else under chatRoom.roomByUsername.{username}:
 *    chat (status/subjectText), mode, stream (same shape as vtoken) and user
 *    (id, displayName, avatars, follower counts, tags, createdAt).
 */
import { httpGet } from './http';

const BASE = 'https://www.camsoda.com';

/** Browser-like UA for the plugin's own site requests (curl transport). */
let userAgent: string | undefined;

export function setRequestUserAgent(ua: string): void {
  userAgent = ua;
}

function requestUserAgent(): string | undefined {
  return userAgent;
}
type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
}

function rec(v: unknown, key: string): Json | null {
  return asRecord(asRecord(v)?.[key]);
}

function str(v: unknown, key: string): string | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'string' ? x : undefined;
}

function num(v: unknown, key: string): number | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'number' ? x : undefined;
}

function strList(v: unknown, key: string): string[] {
  const x = asRecord(v)?.[key];
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];
}

/** Broadcast descriptor returned by vtoken and the room page's `stream` key. */
export interface StreamInfo {
  status: string;
  streamName?: string;
  token?: string;
  edgeServers: string[];
  width?: number;
  height?: number;
  qualityRenditions?: number;
}

export interface RoomData {
  username: string;
  userId?: number;
  displayName?: string;
  /** chat.status: 'online' | 'private' | 'connected' | ... */
  chatStatus?: string;
  /** Room show mode: 'public' | 'private' | ... */
  mode?: string;
  /** chat.subjectText — the stream title / tip menu. */
  title?: string;
  avatarUrl?: string;
  thumbnailUrl?: string;
  profilePictureUrl?: string;
  offlinePictureUrl?: string;
  followerCount?: number;
  createdAt?: string;
  gender?: string;
  tags: string[];
  stream?: StreamInfo;
}

export interface VtokenResult {
  kind: 'live' | 'private' | 'offline' | 'not-found' | 'unknown';
  stream?: StreamInfo;
}

/** True when a stream descriptor can actually be opened by the recorder. */
export function isRecordableStream(stream: StreamInfo): boolean {
  return (
    stream.status === 'online' &&
    stream.edgeServers.length > 0 &&
    typeof stream.streamName === 'string' &&
    stream.streamName.length > 0 &&
    typeof stream.token === 'string' &&
    stream.token.length > 0
  );
}

function parseStreamInfo(raw: Json | null): StreamInfo | undefined {
  if (!raw) return undefined;
  const servers = raw['edge_servers'];
  return {
    status: str(raw, 'status') ?? '',
    streamName: str(raw, 'stream_name'),
    token: str(raw, 'token'),
    edgeServers: Array.isArray(servers)
      ? servers.filter((s): s is string => typeof s === 'string')
      : [],
    width: num(raw, 'width'),
    height: num(raw, 'height'),
    qualityRenditions: num(raw, 'quality_renditions'),
  };
}

/**
 * Cheap live-status poll. One small JSON request (~500 bytes) — the endpoint
 * the site's player itself hits, safe to call on every monitoring tick.
 */
export async function fetchVtoken(username: string, logger?: (m: string) => void): Promise<VtokenResult> {
  const guest = `guest_${Math.floor(10_000 + Math.random() * 90_000)}`;
  const url = `${BASE}/api/v1/video/vtoken/${encodeURIComponent(username)}?username=${guest}`;
  const res = await httpGet(
    url,
    { Accept: 'application/json', Referer: `${BASE}/${encodeURIComponent(username)}` },
    { logger, userAgent: requestUserAgent() },
  );  if (res.status !== 200 || !res.body.trim().startsWith('{')) {
    logger?.(`camsoda: vtoken unusable (status ${res.status})`);
    return { kind: 'unknown' };
  }
  const json = JSON.parse(res.body) as unknown;
  const message = str(json, 'message');
  if (message === 'No broadcaster found') {
    return { kind: 'not-found' };
  }
  const stream = parseStreamInfo(asRecord(json));
  if (!stream) return { kind: 'unknown' };
  if (isRecordableStream(stream)) return { kind: 'live', stream };
  if (stream.status === 'private') return { kind: 'private', stream };
  return { kind: 'offline', stream };
}

/**
 * Extract the JSON preloaded state from an SSR page. Primary: the
 * application/json script tag. Fallback: balanced-brace scan after the
 * __PRELOADED_STATE__ marker (handles inline script references that mention
 * the marker before the real assignment).
 */
export function extractPreloadedState(html: string): unknown {
  const tagIdx = html.lastIndexOf('<script type="application/json" id="__PRELOADED_STATE__">');
  if (tagIdx !== -1) {
    const start = html.indexOf('>', tagIdx) + 1;
    const end = html.indexOf('</script>', start);
    if (start > 0 && end > start) {
      try {
        return JSON.parse(html.slice(start, end)) as unknown;
      } catch {
        /* fall through to brace scan */
      }
    }
  }
  const marker = '__PRELOADED_STATE__';
  const markerIdx = html.lastIndexOf(marker);
  if (markerIdx === -1) return null;
  const start = html.indexOf('{', markerIdx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function roomDataFromState(state: unknown, username: string): RoomData | null {
  const roomByUsername = rec(rec(rec(state, 'chatRoom'), 'roomByUsername'), username.toLowerCase());
  if (!roomByUsername) return null;
  const chat = rec(roomByUsername, 'chat');
  const user = rec(roomByUsername, 'user');
  const follower = rec(user, 'follower');
  const tagListNew = Array.isArray(user?.['tagListNew'])
    ? (user?.['tagListNew'] as unknown[])
    : [];
  const tags = tagListNew
    .map((t) => str(t, 'name') ?? (typeof t === 'string' ? t : undefined))
    .filter((t): t is string => t !== undefined);
  const tagsRaw = tags.length > 0 ? tags : strList(user, 'tagList');
  const avatarUrl = str(user, 'avatarUrl');
  return {
    username: str(user, 'username') ?? username,
    userId: num(user, 'id'),
    displayName: str(user, 'displayName') ?? username,
    chatStatus: str(chat, 'status'),
    mode: str(roomByUsername, 'mode'),
    title: str(chat, 'subjectText'),
    avatarUrl,
    thumbnailUrl: str(user, 'profilePictureThumbUrl') ?? avatarUrl,
    profilePictureUrl: str(user, 'profilePictureUrl'),
    offlinePictureUrl: str(user, 'offlinePictureUrl'),
    followerCount: num(follower, 'countTotal'),
    createdAt: str(user, 'createdAt'),
    gender: str(user, 'gender'),
    tags: tagsRaw,
    stream: parseStreamInfo(rec(roomByUsername, 'stream')) ?? undefined,
  };
}

/**
 * Fetch the room page and parse the SSR preloaded state.
 * Returns null when the creator does not exist (room state missing).
 */
export async function fetchRoomData(username: string, logger?: (m: string) => void): Promise<RoomData | null> {
  const res = await httpGet(
    `${BASE}/${encodeURIComponent(username)}`,
    { Referer: `${BASE}/` },
    { logger, timeoutMs: 25_000, userAgent: requestUserAgent() },
  );
  if (res.status === 404) return null;
  const state = extractPreloadedState(res.body);
  if (!state) {
    logger?.(`camsoda: no preloaded state on room page for ${username}`);
    return null;
  }
  const data = roomDataFromState(state, username);
  if (!data) {
    logger?.(`camsoda: no room state for ${username} (not a broadcaster?)`);
    return null;
  }
  return data;
}

export interface BrowseModel {
  id?: number;
  username?: string;
  displayName?: string;
  status?: string;
  thumbUrl?: string;
  offlinePictureUrl?: string;
  connectionCount?: number;
  title?: string;
}

function parseBrowseUserList(state: unknown): { models: BrowseModel[]; totalCount?: number } {
  const data = rec(rec(rec(state, 'browsePage'), 'data'), 'data') ?? rec(rec(state, 'browsePage'), 'data');
  const raw = data ?? asRecord(state);
  if (!raw) return { models: [] };
  const totalCount = num(raw, 'totalCount');
  const list = Array.isArray(raw['userList']) ? (raw['userList'] as unknown[]) : [];
  const models: BrowseModel[] = [];
  for (const item of list) {
    const m = asRecord(item);
    if (!m) continue;
    const username = str(m, 'username');
    if (!username) continue;
    models.push({
      id: num(m, 'id'),
      username,
      displayName: str(m, 'displayName') ?? username,
      status: str(m, 'status'),
      thumbUrl: str(m, 'thumbUrl'),
      offlinePictureUrl: str(m, 'offlinePictureUrl'),
      connectionCount: num(m, 'connectionCount'),
      title: str(m, 'subjectText'),
    });
  }
  return { models, totalCount };
}

/** Page size used by the /girls SSR listing (perPageCount in the state). */
export const BROWSE_PAGE_SIZE = 98;

/**
 * Fetch one page of the browse listing (SSR). Pagination is URL-driven:
 * /girls?page=N. Only publicly-online rooms carry a streamName; private /
 * connected rooms are skipped — they are not recordable.
 */
export async function fetchBrowseModels(
  page = 1,
  logger?: (m: string) => void,
): Promise<{ models: BrowseModel[]; totalCount?: number }> {
  const res = await httpGet(`${BASE}/girls?page=${page}`, {}, { logger, timeoutMs: 25_000, userAgent: requestUserAgent() });
  if (res.status !== 200) return { models: [] };
  const state = extractPreloadedState(res.body);
  if (!state) return { models: [] };
  const parsed = parseBrowseUserList(state);
  const models = parsed.models.filter((m) => m.status === 'online');
  logger?.(`camsoda: browse page ${page}: ${models.length} online models (total ${parsed.totalCount ?? '?'})`);
  return { models, totalCount: parsed.totalCount };
}
