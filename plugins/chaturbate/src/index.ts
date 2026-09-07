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
import * as https from 'https';
import * as http from 'http';
import manifest from '../manifest.json';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

const BASE = 'https://www.cht.xxx';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ponytail: cookie jar lives in memory only, reset on app restart
let cookieJar: Record<string, string> = {};

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  cookies: {
    type: 'password',
    label: 'Session cookies',
    description: 'Browser cookies for authentication (paste "cookie" header value from DevTools).',
    defaultValue: '',
  },
  userAgent: {
    type: 'text',
    label: 'User-Agent',
    description: 'Browser User-Agent string sent with requests.',
    defaultValue: UA,
  },
};

function getCookieString(): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function parseCookies(setCookies: string[] | undefined): void {
  if (!setCookies) return;
  for (const raw of setCookies) {
    const first = raw.split(';')[0];
    if (!first) continue;
    const pair = first.trim();
    const eq = pair.indexOf('=');
    if (eq > 0) {
      cookieJar[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
}

function getUserAgent(): string {
  const v = ctx?.settings.get('userAgent');
  return typeof v === 'string' ? v : UA;
}

interface HttpResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

// ponytail: simple recursive redirect follower, cap at 5 hops
function httpGet(
  url: string,
  headers: Record<string, string> = {},
  hops = 0,
): Promise<HttpResult> {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  ctx?.logger.debug(`chaturbate: GET ${url}`);
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === 'https:' ? https : http;
    const reqHeaders: Record<string, string> = {
      'User-Agent': getUserAgent(),
      Accept: '*/*',
      ...headers,
    };
    const cookieStr = getCookieString();
    if (cookieStr) reqHeaders['Cookie'] = cookieStr;

    const req = mod.get(url, { headers: reqHeaders, timeout: 15_000 }, (res) => {
      parseCookies(res.headers['set-cookie']);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        ctx?.logger.debug(`chaturbate: ${status} -> redirect to ${next}`);
        res.resume();
        resolve(httpGet(next, headers, hops + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        ctx?.logger.debug(`chaturbate: ${status} ${body.length} bytes from ${url}`);
        resolve({ status, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

interface RoomData {
  room_status?: string;
  slug?: string;
  display_name?: string;
  subject?: string;
  room_title?: string;
  num_viewers?: number;
}

// ponytail: Chaturbate embeds room data as \u0022-escaped JSON in window.initialRoomDossier
// The dossier value is a JSON string containing another JSON object - double-encoded.
function parseDossier(raw: string): Record<string, unknown> | null {
  try {
    // Step 1: decode the outer JSON string (handles \u0022, \u002D, etc.)
    const decoded = JSON.parse(`"${raw}"`) as string;
    // Step 2: parse the inner JSON object
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function unescapeDossier(s: string): string {
  return s
    .replace(/\\u0022/g, '"')
    .replace(/\\u002D/g, '-')
    .replace(/\\u002F/g, '/')
    .replace(/\\u003D/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003A/g, ':')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

function extractRoomData(html: string): RoomData | null {
  // Primary: parse window.initialRoomDossier (Unicode-escaped JSON string)
  const dossierMatch = html.match(
    /window\.initialRoomDossier\s*=\s*"((?:[^"\\]|\\.)*)"/,
  );
  if (dossierMatch?.[1]) {
    const data = parseDossier(dossierMatch[1]);
    if (data) {
      ctx?.logger.debug(`chaturbate: parsed dossier - status=${data['room_status']} viewers=${data['num_viewers']} title=${data['room_title']}`);
      return {
        room_status: data['room_status'] as string | undefined,
        slug: (data['slug'] as string | undefined) ?? undefined,
        display_name: (data['display_name'] as string | undefined) ?? undefined,
        subject: (data['room_title'] as string | undefined) ?? undefined,
        room_title: (data['room_title'] as string | undefined) ?? undefined,
        num_viewers:
          typeof data['num_viewers'] === 'number'
            ? (data['num_viewers'] as number)
            : undefined,
      };
    }
    ctx?.logger.debug('chaturbate: dossier parse failed');
  }

  // Fallback: raw JSON object in HTML (older format)
  const jsonMatch = html.match(/({[^{}]*"room_status"[^{}]*})/);
  if (jsonMatch?.[1]) {
    try {
      ctx?.logger.debug('chaturbate: using raw JSON fallback');
      return JSON.parse(jsonMatch[1]) as RoomData;
    } catch {
      /* ignore */
    }
  }

  // Fallback: individual field regexes on unescaped content
  const decoded = unescapeDossier(html);
  const statusMatch = decoded.match(/"room_status"\s*:\s*"(\w+)"/);
  const slugMatch = decoded.match(/"slug"\s*:\s*"([^"]+)"/);
  const nameMatch = decoded.match(/"display_name"\s*:\s*"([^"]+)"/);
  const titleMatch = decoded.match(/"(?:room_title|subject)"\s*:\s*"([^"]*?)"/);
  const viewersMatch = decoded.match(/"num_viewers"\s*:\s*(\d+)/);
  if (statusMatch?.[1]) {
    ctx?.logger.debug(`chaturbate: regex fallback - status=${statusMatch[1]}`);
    return {
      room_status: statusMatch[1],
      slug: slugMatch?.[1],
      display_name: nameMatch?.[1],
      subject: titleMatch?.[1],
      room_title: titleMatch?.[1],
      num_viewers: viewersMatch?.[1] ? parseInt(viewersMatch[1], 10) : undefined,
    };
  }
  ctx?.logger.debug('chaturbate: no room data found in page');
  return null;
}

function extractMasterUrl(html: string): string | null {
  const dossierMatch = html.match(
    /window\.initialRoomDossier\s*=\s*"((?:[^"\\]|\\.)*)"/,
  );
  if (dossierMatch?.[1]) {
    const decoded = unescapeDossier(dossierMatch[1]);
    const hlsMatch = decoded.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
    if (hlsMatch?.[1]) {
      ctx?.logger.debug(`chaturbate: master URL from dossier: ${hlsMatch[1].substring(0, 80)}...`);
      return hlsMatch[1];
    }
  }
  const hlsMatch = html.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
  if (hlsMatch?.[1]) {
    ctx?.logger.debug(`chaturbate: master URL from raw HTML: ${hlsMatch[1].substring(0, 80)}...`);
  } else {
    ctx?.logger.debug('chaturbate: no stream URL found');
  }
  return hlsMatch?.[1] ?? null;
}

// ponytail: master m3u8 (LLHLS with opaque token) doesn't work in VLC/players.
// Fetch it to get variant chunklist URLs (with CDN session param), return best quality.
async function resolveVariantUrl(masterUrl: string): Promise<string> {
  const res = await httpGet(masterUrl);
  if (res.status !== 200 || !res.body) {
    ctx?.logger.debug(`chaturbate: failed to fetch master m3u8 (${res.status}), using master URL`);
    return masterUrl;
  }

  const lines = res.body.split('\n').map((l) => l.trim());
  let bestBandwidth = -1;
  let bestUrl = '';
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('#EXT-X-STREAM-INF:')) continue;
    const url = lines[i + 1];
    if (!url || url.startsWith('#')) continue;
    const bwMatch = lines[i]!.match(/BANDWIDTH=(\d+)/);
    const bw = bwMatch ? parseInt(bwMatch[1]!, 10) : 0;
    if (bw > bestBandwidth) {
      bestBandwidth = bw;
      bestUrl = url.startsWith('http') ? url : new URL(url, masterUrl).toString();
    }
  }

  if (bestUrl) {
    ctx?.logger.debug(`chaturbate: resolved variant ${bestBandwidth}bps: ${bestUrl.substring(0, 80)}...`);
    return bestUrl;
  }
  ctx?.logger.debug('chaturbate: no variant found in m3u8, using master URL');
  return masterUrl;
}

function extractLoggedInUser(html: string): string | undefined {
  const m = html.match(/"username"\s*:\s*"([^"]+)"/);
  return m?.[1];
}

// ponytail: only truly public rooms are recordable. 'private'/'group' rooms
// have no publicly-accessible HLS playlist, so reporting them as live made
// the app show "Live" while any recording attempt would fail. Treat them
// as offline globally (badges, monitoring, auto-record all use this).
function isLiveStatus(s: string | undefined): boolean {
  return s === 'public';
}

function htmlToCreatorInfo(username: string, roomData: RoomData | null, html: string): CreatorInfo {
  const live = isLiveStatus(roomData?.room_status);
  const decoded = unescapeDossier(html);
  const avatarMatch = decoded.match(/"profile_image_url"\s*:\s*"([^"]+)"/);
  return {
    id: `chaturbate:${username}`,
    username,
    displayName: roomData?.display_name ?? username,
    avatarUrl: avatarMatch?.[1],
    profileUrl: `${BASE}/${username}/`,
    bio: roomData?.subject ?? roomData?.room_title,
    isLive: live,
    liveUrl: live ? `${BASE}/${username}/` : undefined,
  };
}

const ROUTE_PATHS = new Set([
  'api', 'auth', 'terms', 'privacy', 'tags', 'discover', 'following',
  'accounts', 'security', 'billingsupport', 'law_enforcement', 'jobs',
  'contest', 'affiliates', 'v2apps', 'sitemap', 'swag',
]);

function parseRoomList(html: string): CreatorInfo[] {
  const decoded = unescapeDossier(html);
  const creators: CreatorInfo[] = [];
  const roomPattern = /"slug"\s*:\s*"([^"]+)".*?"display_name"\s*:\s*"([^"]*)".*?"room_status"\s*:\s*"(\w+)"/gs;
  let match;
  while ((match = roomPattern.exec(decoded)) !== null) {
    const slug = match[1] ?? '';
    const displayName = match[2] || slug;
    const roomStatus = match[3] ?? '';
    const live = isLiveStatus(roomStatus);
    creators.push({
      id: `chaturbate:${slug}`,
      username: slug,
      displayName,
      profileUrl: `${BASE}/${slug}/`,
      isLive: live,
      liveUrl: live ? `${BASE}/${slug}/` : undefined,
    });
  }
  return creators;
}

function parseSearchResults(html: string): CreatorInfo[] {
  const decoded = unescapeDossier(html);
  const creators: CreatorInfo[] = [];
  const seen = new Set<string>();
  const linkPattern = /href="\/([^"/]+)\/"[^>]*>.*?"room_status"\s*:\s*"(\w+)"/gs;
  let match;
  while ((match = linkPattern.exec(decoded)) !== null) {
    const slug = match[1] ?? '';
    const roomStatus = match[2] ?? '';
    if (seen.has(slug)) continue;
    seen.add(slug);
    const live = isLiveStatus(roomStatus);
    creators.push({
      id: `chaturbate:${slug}`,
      username: slug,
      displayName: slug,
      profileUrl: `${BASE}/${slug}/`,
      isLive: live,
      liveUrl: live ? `${BASE}/${slug}/` : undefined,
    });
  }
  if (creators.length === 0) {
    const simplePattern = /href="\/([a-zA-Z0-9_-]+)\/"/g;
    while ((match = simplePattern.exec(decoded)) !== null) {
      const slug = match[1] ?? '';
      if (seen.has(slug) || ROUTE_PATHS.has(slug)) continue;
      seen.add(slug);
      creators.push({
        id: `chaturbate:${slug}`,
        username: slug,
        displayName: slug,
        profileUrl: `${BASE}/${slug}/`,
      });
    }
  }
  return creators;
}

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    auth: {
      async getStatus(): Promise<AuthStatus> {
        const cookieStr = getCookieString();
        if (!cookieStr) return { authenticated: false };
        try {
          const res = await httpGet(`${BASE}/`);
          const hasSession = res.body.includes('Logout') || res.body.includes('logout');
          return {
            authenticated: hasSession,
            username: hasSession ? extractLoggedInUser(res.body) : undefined,
          };
        } catch {
          return { authenticated: false };
        }
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        cookieJar = {};
        for (const part of cookieHeader.split(';')) {
          const eqIdx = part.indexOf('=');
          if (eqIdx > 0) {
            cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
          }
        }
        ctx?.logger.info('chaturbate: cookies loaded');
      },
      async logout(): Promise<void> {
        cookieJar = {};
        ctx?.logger.info('chaturbate: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim();
        const limit = query.limit ?? 10;
        if (!q) {
          try {
            const res = await httpGet(`${BASE}/`);
            return { creators: parseRoomList(res.body).slice(0, limit), total: limit };
          } catch {
            return { creators: [], total: 0 };
          }
        }
        try {
          const res = await httpGet(`${BASE}/search/?q=${encodeURIComponent(q)}`);
          const creators = parseSearchResults(res.body).slice(0, limit);
          return { creators, total: creators.length };
        } catch {
          try {
            const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
            return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
          } catch {
            return { creators: [], total: 0 };
          }
        }
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const username = identifier.replace(/^chaturbate:/, '');
        try {
          const res = await httpGet(`${BASE}/${username}/`);
          if (res.status === 404) return null;
          const roomData = extractRoomData(res.body);
          return htmlToCreatorInfo(username, roomData, res.body);
        } catch {
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const username = identifier.replace(/^chaturbate:/, '');
        ctx?.logger.debug(`chaturbate: checking live status for ${username}`);
        try {
          const res = await httpGet(`${BASE}/${username}/`);
          if (res.status === 404) {
            ctx?.logger.debug(`chaturbate: ${username} not found (404)`);
            return { isLive: false };
          }
          const roomData = extractRoomData(res.body);
          const live = isLiveStatus(roomData?.room_status);
          ctx?.logger.debug(`chaturbate: ${username} room_status=${roomData?.room_status} isLive=${live}`);
          if (!live) return { isLive: false };
          const masterUrl = extractMasterUrl(res.body);
          const streamUrl = masterUrl ? await resolveVariantUrl(masterUrl) : null;
          return {
            isLive: true,
            title: roomData?.subject ?? roomData?.room_title ?? `${username} is live`,
            viewerCount: roomData?.num_viewers,
            streamUrl: streamUrl ?? undefined,
          };
        } catch (e) {
          ctx?.logger.debug(`chaturbate: ${username} check failed: ${e}`);
          return { isLive: false };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const username = identifier.replace(/^chaturbate:/, '');
        ctx?.logger.debug(`chaturbate: extracting stream for ${username}`);
        const res = await httpGet(`${BASE}/${username}/`);
        if (res.status === 404) throw new Error(`Room ${username} not found`);
        const roomData = extractRoomData(res.body);
        if (!isLiveStatus(roomData?.room_status)) throw new Error(`${username} is not live`);
        const masterUrl = extractMasterUrl(res.body);
        if (!masterUrl) throw new Error(`Could not extract stream URL for ${username}`);
        const streamUrl = await resolveVariantUrl(masterUrl);
        ctx?.logger.debug(`chaturbate: stream extracted for ${username}: ${streamUrl.substring(0, 80)}...`);

        const cookies = Object.entries(cookieJar).map(([name, value]) => ({
          name,
          value,
          domain: '.cht.xxx',
          path: '/',
          secure: true,
        }));

        return {
          creatorId: `chaturbate:${username}`,
          creatorName: roomData?.display_name ?? username,
          platformId: 'chaturbate',
          title: roomData?.subject ?? roomData?.room_title ?? `${username} live on Chaturbate`,
          streamUrl,
          headers: {
            'User-Agent': getUserAgent(),
            Referer: `${BASE}/${username}/`,
            Origin: BASE,
          },
          cookies,
          qualityOptions: [{ id: 'best', label: 'Best', format: 'hls', isBest: true }],
          metadata: {
            category: 'Chaturbate',
            tags: [roomData?.room_status ?? 'live'],
          },
          startedAt: new Date().toISOString(),
        };
      },
    },

    settings: {
      getSchema(): Record<string, SettingDef> {
        return SETTINGS_SCHEMA;
      },
      async validate(_values: PluginSettingValues) {
        return { valid: true, errors: {} };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        try {
          const res = await httpGet(`${BASE}/`);
          return {
            healthy: res.status === 200,
            message: res.status === 200 ? 'Chaturbate reachable' : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const username = identifier.replace(/^chaturbate:/, '');
        try {
          const res = await httpGet(`${BASE}/${username}/`);
          const roomData = extractRoomData(res.body);
          const decoded = unescapeDossier(res.body);
          const avatarMatch = decoded.match(/"profile_image_url"\s*:\s*"([^"]+)"/);
          const bioMatch = decoded.match(/"(?:room_subject|room_title)"\s*:\s*"([^"]*?)"/);
          const followersMatch = decoded.match(/"followers"\s*:\s*(\d+)/);
          return {
            displayName: roomData?.display_name ?? username,
            avatarUrl: avatarMatch?.[1],
            bio: bioMatch?.[1] ?? roomData?.subject ?? roomData?.room_title,
            followerCount: followersMatch?.[1] ? parseInt(followersMatch[1], 10) : undefined,
            website: `${BASE}/${username}/`,
          };
        } catch {
          return { displayName: username };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('chaturbate: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      for (const part of savedCookies.split(';')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx > 0) {
          cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
        }
      }
      context.logger.info('chaturbate: loaded saved cookies');
    }
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
    ctx = null;
  },
};

export default plugin;
