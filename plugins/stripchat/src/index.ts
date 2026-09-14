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
import { MouflonProxy } from './mouflon-proxy';
import { ProxyRegistry } from '@rekordly/plugin-sdk';
import { blockHeavyResources, launchHeadlessBrowser } from './browser';
import { createPdKeyResolver } from './mouflon-cipher';
import manifest from '../manifest.json';

// ponytail: the Mouflon proxy must outlive extractStream() — the host starts
// recording right after we return. Proxies are tracked PER MODEL (username):
// every extraction mints a fresh pkey-signed URL, so keying by URL meant a
// re-extract of model A evicted some OTHER model's live proxy, producing
// ffmpeg "Connection refused" on 127.0.0.1:<port> on any 3rd concurrent
// recording. The registry cap counts only proxies still holding a headless
// browser (released ones are tiny local servers); the proxies' own idle
// watchdog releases browsers ~90s after a recording stops requesting.
const MAX_ACTIVE_PROXIES = 2;
const activeProxies = new ProxyRegistry<MouflonProxy>(MAX_ACTIVE_PROXIES);

// ponytail: shared pdkey resolver — resolved keys are cached across ALL
// extractions/recordings (one player-JS scrape per unknown pkey max).
let pdKeyResolver: ReturnType<typeof createPdKeyResolver> | null = null;
function getPdKeyResolver(): ReturnType<typeof createPdKeyResolver> {
  if (pdKeyResolver === null) {
    pdKeyResolver = createPdKeyResolver(
      async (url) => (await httpGet(url)).body,
      getBase,
      ctx ? (m: string) => ctx?.logger.debug(m) : undefined,
    );
  }
  return pdKeyResolver;
}

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

// ponytail: stripchat.ooo is the user's preferred mirror; configurable in settings
const DEFAULT_BASE = 'https://stripchat.ooo';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ponytail: cookie jar lives in memory only, reset on app restart
let cookieJar: Record<string, string> = {};

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  baseUrl: {
    type: 'text',
    label: 'Base URL',
    description: 'Stripchat mirror/domain to use for API and page requests.',
    defaultValue: DEFAULT_BASE,
  },
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

function loadCookieHeader(header: string): void {
  cookieJar = {};
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
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
  return typeof v === 'string' && v.trim() ? v : UA;
}

function getBase(): string {
  const v = ctx?.settings.get('baseUrl');
  const base = typeof v === 'string' && v.trim() ? v.trim() : DEFAULT_BASE;
  return base.replace(/\/+$/, '');
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
  ctx?.logger.debug(`stripchat: GET ${url}`);
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === 'https:' ? https : http;
    // ponytail: stripchat's WAF returns 406/403 unless requests look like a
    // real browser — full Accept list + Accept-Language are required.
    const reqHeaders: Record<string, string> = {
      'User-Agent': getUserAgent(),
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    };
    const cookieStr = getCookieString();
    if (cookieStr) reqHeaders['Cookie'] = cookieStr;

    const req = mod.get(url, { headers: reqHeaders, timeout: 15_000 }, (res) => {
      parseCookies(res.headers['set-cookie']);
      const statusCode = res.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        ctx?.logger.debug(`stripchat: ${statusCode} -> redirect to ${next}`);
        res.resume();
        resolve(httpGet(next, headers, hops + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        ctx?.logger.debug(`stripchat: ${statusCode} ${body.length} bytes from ${url}`);
        resolve({ status: statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

// ---- generic JSON helpers -------------------------------------------------

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

function bool(v: unknown, key: string): boolean | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'boolean' ? x : undefined;
}

/**
 * Extract a balanced-brace JSON object that follows `marker` in an HTML page.
 * Handles strings/escapes so nested braces inside values don't break scanning.
 */
function extractJsonAfter(html: string, marker: string): unknown {
  // ponytail: the marker can appear earlier inside inline scripts (e.g. a
  // feature check like '"__PRELOADED_STATE__" in window'); the actual
  // assignment is always the LAST occurrence on the page.
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

// ---- cam/model data -------------------------------------------------------

interface CamInfo {
  modelId?: number;
  username?: string;
  displayName?: string;
  isLive: boolean;
  title?: string;
  viewers?: number;
  snapshot?: string;
  /** e.g. "27" from viewServers.flashphoner-hls = "b-hls-27" */
  serverHint?: string;
}

/**
 * ponytail: doppiocdn serves UNSIGNED playlist paths alongside the signed
 * ones the web player uses:
 *   https://media-hls.doppiocdn.org/b-hls-{NN}/{modelId}/{modelId}_auto.m3u8
 * These need no pkey token — just browser-like headers — and stay valid for
 * the whole stream (the edge 302-redirects to the current shard). Signed
 * pkey URLs expire within minutes, so we never reuse those.
 */
function hlsCandidates(modelId: number, serverHint?: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (server: string): void => {
    const n = server.replace(/^b-hls-/i, '').replace(/\D/g, '');
    if (!n) return;
    for (const name of [`${modelId}_auto`, `${modelId}`]) {
      const u = `https://media-hls.doppiocdn.org/b-hls-${n}/${modelId}/${name}.m3u8`;
      if (!seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
  };
  if (serverHint) push(serverHint);
  for (let s = 1; s <= 30; s++) push(String(s));
  return urls;
}

/**
 * ponytail: unsigned playlist paths serve a looping promo clip (the CDN
 * redirects them to /cpa/v2/... VOD content), NOT the real stream. The real
 * stream requires a signed URL (?psch=v2&pkey=...) that the web player
 * obtains at runtime. We capture it by loading the room page in a headless
 * system browser (Edge/Chrome — no download needed) and intercepting the
 * player's m3u8 requests. Session cookies are injected so logged-in users
 * get full-quality variants instead of the anonymous blurred preview.
 *
 * ponytail: on SUCCESS the browser is returned alongside the URL — the
 * caller transfers it into the MouflonProxy, which reuses it for segment
 * decoding instead of spawning a SECOND Chromium process per recording
 * (two Chromium instances per auto-record used to stall smaller machines).
 * On FAILURE the browser is closed here before returning null.
 */
async function captureSignedStream(
  username: string,
): Promise<{ url: string; browser: import('playwright-core').Browser } | null> {
  let browser: import('playwright-core').Browser | null = null;
  try {
    browser = await launchHeadlessBrowser();
    const context = await browser.newContext({
      userAgent: getUserAgent(),
      viewport: { width: 1280, height: 720 },
    });
    const cookieEntries = Object.entries(cookieJar);
    if (cookieEntries.length > 0) {
      await context.addCookies(
        cookieEntries.map(([name, value]) => ({
          name,
          value,
          domain: `.${new URL(getBase()).hostname}`,
          path: '/',
          secure: true,
        })),
      );
    }
    const page = await context.newPage();
    await blockHeavyResources(page);
    const candidates = new Set<string>();
    // ponytail: event-driven wakeup — the request handler notifies the
    // waiter directly instead of a 500ms polling loop.
    let notifyCandidate: (() => void) | null = null;
    page.on('request', (req) => {
      const url = req.url();
      // ponytail: some rooms serve the real stream on quality-variant
      // playlists (_NNNp), others directly on the bare {id}.m3u8 master.
      // Capture every signed playlist; the validation step below rejects
      // anything that resolves to the /cpa/ promo loop.
      if (url.includes('.m3u8') && url.includes('pkey=')) {
        candidates.add(url);
        ctx?.logger.debug(`stripchat: intercepted signed variant (${candidates.size})`);
        notifyCandidate?.();
      }
    });
    const waitForCandidates = (timeoutMs: number): Promise<boolean> =>
      new Promise((resolve) => {
        if (candidates.size > 0) {
          resolve(true);
          return;
        }
        const waiter = (): void => {
          clearTimeout(timer);
          resolve(true);
        };
        const timer = setTimeout(() => {
          if (notifyCandidate === waiter) notifyCandidate = null;
          resolve(false);
        }, timeoutMs);
        timer.unref?.();
        notifyCandidate = waiter;
      });

    // ponytail: the player connects via websocket then starts HLS — give it
    // time, nudge it with a click (autoplay policies vary), and reload once
    // if nothing was captured.
    for (let attempt = 0; attempt < 2 && candidates.size === 0; attempt++) {
      if (attempt === 1) {
        ctx?.logger.debug('stripchat: no candidates yet — reloading room page');
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
        } catch {
          break;
        }
      } else {
        await page.goto(`${getBase()}/${encodeURIComponent(username)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
      }
      const clickTimer = setTimeout(() => {
        page.mouse.click(640, 360).catch(() => undefined);
      }, 5_000);
      clickTimer.unref?.();
      await waitForCandidates(20_000);
      clearTimeout(clickTimer);
    }

    if (candidates.size === 0) {
      ctx?.logger.warn('stripchat: no signed playlist captured from browser');
      try { await browser.close(); } catch { /* ignore */ }
      return null;
    }

    // Prefer real-quality variants over the anonymous blurred preview, and
    // higher resolutions within each class.
    const score = (url: string): number => {
      const res = parseInt(url.match(/_(\d+)p/)?.[1] ?? '0', 10);
      return res - (/blurred/i.test(url) ? 10_000 : 0);
    };
    // ponytail: validate each candidate — reject anything that resolves to
    // the /cpa/ VOD promo loop instead of the live stream.
    const ordered = [...candidates].sort((a, b) => score(b) - score(a));
    for (const candidate of ordered) {
      try {
        const res = await httpGet(candidate, cdnHeaders());
        const isLivePlaylist =
          res.status === 200 &&
          res.body.includes('#EXTM3U') &&
          !res.body.includes('#EXT-X-PLAYLIST-TYPE:VOD') &&
          !res.body.includes('/cpa/');
        if (isLivePlaylist) {
          ctx?.logger.debug(`stripchat: captured signed stream URL: ${candidate.substring(0, 100)}...`);
          return { url: candidate, browser };
        }
        ctx?.logger.debug(`stripchat: candidate rejected (demo/VOD): ${candidate.substring(0, 90)}...`);
      } catch {
        /* try next candidate */
      }
    }
    ctx?.logger.warn('stripchat: all intercepted candidates were demo/VOD');
    try { await browser.close(); } catch { /* ignore */ }
    return null;
  } catch (e) {
    ctx?.logger.warn(`stripchat: browser interception failed: ${e}`);
    if (browser !== null) {
      try { await browser.close(); } catch { /* already closed */ }
    }
    return null;
  }
}

/** Headers doppiocdn edges expect; without these even valid playlists 403. */
function cdnHeaders(): Record<string, string> {
  const base = getBase();
  return {
    Referer: `${base}/`,
    Origin: base,
    Accept: '*/*',
  };
}

async function probeMaster(url: string): Promise<boolean> {
  try {
    const res = await httpGet(url, cdnHeaders());
    return res.status === 200 && res.body.includes('#EXTM3U');
  } catch {
    return false;
  }
}

/** Probe candidate unsigned master playlists until one responds. */
async function findWorkingMaster(modelId: number, serverHint?: string): Promise<string> {
  for (const url of hlsCandidates(modelId, serverHint)) {
    if (await probeMaster(url)) {
      ctx?.logger.debug(`stripchat: working master playlist: ${url}`);
      return url;
    }
  }
  throw new Error(
    `No reachable HLS playlist for model ${modelId} (tried unsigned b-hls paths)`,
  );
}

interface Variant {
  url: string;
  bandwidth: number;
  codecs?: string;
  resolution?: string;
}

/**
 * Fetch a master playlist and pick the best variant.
 * ponytail: prefer H.264 (avc1) over AV1/hevc — AV1 segments break recording
 * and playback on many systems. Implemented as a large score bonus so a
 * slightly lower-bandwidth avc1 variant still wins over an av1 one.
 */
async function resolveBestVariant(
  masterUrl: string,
): Promise<{
  url: string;
  qualityOptions: Array<{
    id: string;
    label: string;
    format: string;
    resolution?: string;
    bitrate?: number;
    isBest?: boolean;
  }>;
}> {
  const fallbackQuality = [
    { id: 'best', label: 'Best', format: 'hls', isBest: true },
  ];
  const res = await httpGet(masterUrl, cdnHeaders());
  if (res.status !== 200 || !res.body.includes('#EXT-X-STREAM-INF')) {
    // Already a media playlist (or unreachable) — use as-is.
    return { url: masterUrl, qualityOptions: fallbackQuality };
  }

  const lines = res.body.split('\n').map((l) => l.trim());
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('#EXT-X-STREAM-INF:')) continue;
    const rawUrl = lines[i + 1];
    if (!rawUrl || rawUrl.startsWith('#')) continue;
    const attrs = lines[i]!.slice('#EXT-X-STREAM-INF:'.length);
    const bandwidth = parseInt(attrs.match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const codecs = attrs.match(/CODECS="([^"]*)"/)?.[1];
    const resolution = attrs.match(/RESOLUTION=(\S+)/)?.[1];
    const url = /^https?:/i.test(rawUrl) ? rawUrl : new URL(rawUrl, masterUrl).toString();
    variants.push({ url, bandwidth, codecs, resolution });
  }

  if (variants.length === 0) {
    return { url: masterUrl, qualityOptions: fallbackQuality };
  }

  const score = (v: Variant): number => {
    let s = v.bandwidth;
    if (/avc1/i.test(v.codecs ?? '')) s += 5_000_000;
    else if (/av01|hvc1|hev1/i.test(v.codecs ?? '')) s -= 5_000_000;
    return s;
  };
  variants.sort((a, b) => score(b) - score(a));

  const qualityOptions = variants.map((v, idx) => ({
    id: `variant-${idx}`,
    label: v.resolution ?? `${Math.round(v.bandwidth / 1000)} kbps`,
    format: 'hls',
    resolution: v.resolution,
    bitrate: v.bandwidth > 0 ? v.bandwidth : undefined,
    isBest: idx === 0,
  }));

  ctx?.logger.debug(
    `stripchat: picked variant ${variants[0]!.resolution ?? ''} ${variants[0]!.bandwidth}bps codecs=${variants[0]!.codecs ?? '?'}`,
  );
  return { url: variants[0]!.url, qualityOptions };
}

// ponytail: isCamAvailable=true means a PUBLICLY watchable cam. Models in
// private/group shows still carry a streamName but isCamAvailable=false —
// their HLS playlists are not publicly accessible, so they must count as
// offline for recording purposes (same policy as the Chaturbate plugin).
function computeIsLive(cam: Json | null, model: Json | null): boolean {
  if (cam && bool(cam, 'isCamAvailable') === true) return true;
  if (model && str(model, 'status') === 'public' && bool(model, 'isLive') === true) {
    return true;
  }
  return false;
}

function pickSnapshot(model: Json | null, cam: Json | null): string | undefined {
  const snapshots = rec(model, 'snapshots');
  return (
    str(cam, 'snapshot') ??
    str(snapshots, 'main') ??
    str(snapshots, 'thumbnail') ??
    str(model, 'avatarUrl')
  );
}

function camInfoFromApi(json: unknown): CamInfo | null {
  // ponytail: actual API shape is { cam, user: { user: {id, username, ...} } }
  // — the model object lives at user.user; some versions expose "model" instead.
  const model = rec(json, 'model') ?? rec(rec(json, 'user'), 'user');
  const cam = rec(json, 'cam');
  const modelId = num(model, 'id') ?? num(cam, 'streamName');
  if (modelId === undefined) return null;
  const viewServers = rec(cam, 'viewServers');
  return {
    modelId,
    username: str(model, 'username'),
    displayName: str(model, 'displayName') ?? str(model, 'username'),
    isLive: computeIsLive(cam, model),
    title: str(cam, 'topic') ?? str(model, 'topic'),
    viewers: num(cam, 'viewersCount') ?? num(model, 'viewersCount'),
    snapshot: pickSnapshot(model, cam),
    serverHint:
      str(viewServers, 'flashphoner-hls') ?? str(model, 'broadcastServer'),
  };
}

function camInfoFromPageState(state: unknown): CamInfo | null {
  const viewCam = rec(state, 'viewCam');
  if (!viewCam) return null;
  const model = rec(viewCam, 'model');
  const cam = rec(viewCam, 'cam');
  const modelId = num(model, 'id');
  if (modelId === undefined) return null;
  const viewServers = rec(cam, 'viewServers');
  return {
    modelId,
    username: str(model, 'username'),
    displayName: str(model, 'displayName') ?? str(model, 'username'),
    isLive: computeIsLive(cam, model),
    title: str(cam, 'topic') ?? str(model, 'topic'),
    viewers: num(cam, 'viewersCount') ?? num(cam, 'viewers'),
    snapshot: pickSnapshot(model, cam),
    serverHint: str(viewServers, 'flashphoner-hls'),
  };
}

/**
 * Resolve model ID + live state for a username.
 * Primary: JSON cam API. Fallback: scrape window.__PRELOADED_STATE__ off the
 * room page (the site is a SPA — the state blob always carries model data).
 */
async function fetchCamData(username: string): Promise<CamInfo> {
  const base = getBase();
  try {
    const res = await httpGet(
      `${base}/api/front/v2/models/username/${encodeURIComponent(username)}/cam`,
      { Accept: 'application/json' },
    );
    if (res.status === 200 && res.body.trim().startsWith('{')) {
      const info = camInfoFromApi(JSON.parse(res.body) as unknown);
      if (info) {
        ctx?.logger.debug(
          `stripchat: api model=${info.modelId} live=${info.isLive} hint=${info.serverHint ?? '-'}`,
        );
        return info;
      }
    }
    ctx?.logger.debug(`stripchat: cam api unusable (status ${res.status})`);
  } catch (e) {
    ctx?.logger.debug(`stripchat: cam api failed: ${e}`);
  }

  const res = await httpGet(`${base}/${encodeURIComponent(username)}`);
  if (res.status === 404) throw new Error(`Model ${username} not found`);
  const state = extractJsonAfter(res.body, '__PRELOADED_STATE__');
  const info = state !== null ? camInfoFromPageState(state) : null;
  if (!info) throw new Error(`Could not resolve model data for ${username}`);
  ctx?.logger.debug(
    `stripchat: page-state model=${info.modelId} live=${info.isLive} hint=${info.serverHint ?? '-'}`,
  );
  return info;
}

// ---- creator listing helpers ---------------------------------------------

function creatorFromUsername(username: string, info?: Partial<CamInfo>): CreatorInfo {
  const base = getBase();
  const live = info?.isLive === true;
  return {
    id: `stripchat:${username}`,
    username,
    displayName: info?.displayName ?? username,
    avatarUrl: info?.snapshot,
    profileUrl: `${base}/${username}`,
    isLive: live,
    liveUrl: live ? `${base}/${username}` : undefined,
  };
}

/** Walk arbitrary JSON collecting unique {id:number, username:string} models. */
function collectModels(node: unknown, out: Map<string, CreatorInfo>, depth = 0): void {
  if (depth > 12 || out.size >= 60) return;
  const obj = asRecord(node);
  if (obj) {
    const id = obj['id'];
    const username = obj['username'];
    if (typeof id === 'number' && typeof username === 'string' && username.length > 0 && !out.has(username)) {
      // ponytail: listing entries carry isLive/status — only 'public' rooms
      // are recordable.
      const live = obj['isLive'] === true && obj['status'] === 'public';
      out.set(username, creatorFromUsername(username, { isLive: live }));
    }
    for (const value of Object.values(obj)) collectModels(value, out, depth + 1);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectModels(item, out, depth + 1);
  }
}

// ---- plugin ---------------------------------------------------------------

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    auth: {
      async getStatus(): Promise<AuthStatus> {
        if (getCookieString() === '') return { authenticated: false };
        try {
          const res = await httpGet(`${getBase()}/api/front/v2/users/me`, {
            Accept: 'application/json',
          });
          const ok = res.status === 200 && !res.body.includes('"error"');
          return { authenticated: ok };
        } catch {
          return { authenticated: false };
        }
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        loadCookieHeader(cookieHeader);
        ctx?.logger.info('stripchat: cookies loaded');
      },
      async logout(): Promise<void> {
        cookieJar = {};
        ctx?.logger.info('stripchat: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim();
        const limit = query.limit ?? 10;
        if (!q) {
          try {
            // ponytail: the site's own listing API — homepage SSR ships an
            // empty model list, so this is the reliable discovery path.
            const res = await httpGet(
              `${getBase()}/api/front/v2/models?primaryTag=girls&limit=${Math.min(limit * 3, 50)}`,
              { Accept: 'application/json' },
            );
            if (res.status === 200 && res.body.trim().startsWith('{')) {
              const found = new Map<string, CreatorInfo>();
              collectModels(JSON.parse(res.body) as unknown, found);
              const creators = [...found.values()].slice(0, limit);
              return { creators, total: creators.length };
            }
          } catch {
            /* fall through to homepage scrape */
          }
          try {
            const res = await httpGet(`${getBase()}/`);
            const state = extractJsonAfter(res.body, '__PRELOADED_STATE__');
            const found = new Map<string, CreatorInfo>();
            if (state !== null) collectModels(state, found);
            const creators = [...found.values()].slice(0, limit);
            return { creators, total: creators.length };
          } catch {
            return { creators: [], total: 0 };
          }
        }
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const username = identifier.replace(/^stripchat:/, '');
        try {
          const info = await fetchCamData(username);
          return creatorFromUsername(info.username ?? username, info);
        } catch {
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const username = identifier.replace(/^stripchat:/, '');
        ctx?.logger.debug(`stripchat: checking live status for ${username}`);
        try {
          const info = await fetchCamData(username);
          if (!info.isLive) return { isLive: false };
          // Resolve a fresh playable URL so the host can record immediately.
          let streamUrl: string | undefined;
          if (info.modelId !== undefined) {
            try {
              const master = await findWorkingMaster(info.modelId, info.serverHint);
              streamUrl = (await resolveBestVariant(master)).url;
            } catch (e) {
              ctx?.logger.debug(`stripchat: live but no playlist yet: ${e}`);
            }
          }
          return {
            isLive: true,
            title: info.title ?? `${username} is live`,
            thumbnail: info.snapshot,
            viewerCount: info.viewers,
            streamUrl,
          };
        } catch (e) {
          ctx?.logger.debug(`stripchat: ${username} check failed: ${e}`);
          return { isLive: false };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const username = identifier.replace(/^stripchat:/, '');
        ctx?.logger.debug(`stripchat: extracting stream for ${username}`);
        const info = await fetchCamData(username);
        if (!info.isLive) throw new Error(`${username} is not live`);
        if (info.modelId === undefined) throw new Error(`No model ID for ${username}`);

        // ponytail: prefer the REAL signed stream captured from the player;
        // unsigned paths only serve a looping promo clip. Fall back to the
        // unsigned path only if the browser capture fails entirely.
        let streamUrl: string;
        let qualityOptions: Array<{
          id: string;
          label: string;
          format: string;
          resolution?: string;
          bitrate?: number;
          isBest?: boolean;
        }>;
        const captured = await captureSignedStream(info.username ?? username);
        if (captured !== null) {
          // ponytail: the signed playlist's segment URIs are MOUFLON-obfuscated
          // (ffmpeg cannot read them). Serve a de-obfuscated local playlist via
          // the browser-backed proxy instead of the raw CDN URL. The capture
          // browser is REUSED by the proxy (ownership transfers) — one Chromium
          // process per recording instead of two.
          const base = getBase();
          const modelKey = (info.username ?? username).toLowerCase();
          const proxy = new MouflonProxy(
            captured.url,
            `${base}/${encodeURIComponent(info.username ?? username)}`,
            {
              'User-Agent': getUserAgent(),
              Referer: `${base}/`,
              Origin: base,
              Accept: '*/*',
            },
            {
              logger: ctx ? { debug: (m: string) => ctx?.logger.debug(m) } : undefined,
              // ponytail: pure-Node MOUFLON decoding — when the pdkey is
              // known, segment URLs are decrypted without the browser and
              // the headless browser is released for the whole recording.
              resolvePdKey: getPdKeyResolver(),
              // ponytail: when the idle watchdog stops the proxy (recording
              // ended), drop it from the tracking map so the browser-holder
              // cap does not count a dead proxy against live ones.
              onIdleStop: () => {
                activeProxies.delete(modelKey);
              },
            },
          );
          let started = false;
          try {
            await proxy.start({ browser: captured.browser });
            started = true;
          } catch (e) {
            ctx?.logger.warn(`stripchat: mouflon proxy failed to start: ${e}`);
            // ponytail: proxy.stop() closes the transferred capture browser
            // along with the local server (ownership was handed over).
            void proxy.stop().catch(() => undefined);
          }
          if (started) {
            // ponytail: same-model re-extract replaces its own entry (fresh
            // signed URL) instead of evicting a neighbor; overflow victims
            // are stopped asynchronously and only logged.
            for (const evicted of activeProxies.set(modelKey, proxy)) {
              ctx?.logger.debug(`stripchat: stopping replaced/evicted proxy for ${evicted.key}`);
              void evicted.proxy.stop().catch(() => undefined);
            }
            streamUrl = proxy.url;
          } else {
            // ponytail: fall back to the raw signed URL — previously the code
            // overwrote this with proxy.url even after a failed start.
            streamUrl = captured.url;
          }
          qualityOptions = [{ id: 'best', label: 'Best', format: 'hls', isBest: true }];
        } else {
          // ponytail: unsigned paths serve a looping promo clip, NOT the
          // stream — "recording" one produces a dummy video. Fail loudly so
          // the job shows a real error (and retries) instead of saving junk.
          ctx?.logger.error(
            'stripchat: signed stream capture failed — browser automation unavailable. Not falling back to the unsigned promo playlist.',
          );
          throw new Error(
            'Stripchat: could not capture the real stream (headless browser unavailable). Recording the unsigned playlist would only capture the promo loop.',
          );
        }
        ctx?.logger.debug(`stripchat: stream extracted for ${username}: ${streamUrl.substring(0, 80)}...`);

        const base = getBase();
        const cookies = Object.entries(cookieJar).map(([name, value]) => ({
          name,
          value,
          domain: new URL(base).hostname,
          path: '/',
          secure: true,
        }));

        return {
          creatorId: `stripchat:${info.username ?? username}`,
          creatorName: info.displayName ?? username,
          platformId: 'stripchat',
          title: info.title ?? `${username} live on Stripchat`,
          thumbnail: info.snapshot,
          streamUrl,
          headers: {
            'User-Agent': getUserAgent(),
            Referer: `${base}/`,
            Origin: base,
          },
          cookies,
          qualityOptions,
          metadata: {
            category: 'Stripchat',
            tags: ['live'],
            resolution: qualityOptions[0]?.resolution,
          },
          startedAt: new Date().toISOString(),
        };
      },
    },

    settings: {
      getSchema(): Record<string, SettingDef> {
        return SETTINGS_SCHEMA;
      },
      async validate(values: PluginSettingValues) {
        const errors: Record<string, string> = {};
        const base = values['baseUrl'];
        if (typeof base === 'string' && base.trim() !== '') {
          try {
            const u = new URL(base.trim());
            if (u.protocol !== 'https:' && u.protocol !== 'http:') {
              errors['baseUrl'] = 'Must be an http(s) URL';
            }
          } catch {
            errors['baseUrl'] = 'Invalid URL';
          }
        }
        return { valid: Object.keys(errors).length === 0, errors };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        try {
          const res = await httpGet(`${getBase()}/`);
          return {
            healthy: res.status === 200,
            message: res.status === 200 ? 'Stripchat reachable' : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const username = identifier.replace(/^stripchat:/, '');
        try {
          const info = await fetchCamData(username);
          return {
            displayName: info.displayName ?? username,
            avatarUrl: info.snapshot,
            bio: info.title,
            website: `${getBase()}/${username}`,
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
    context.logger.info('stripchat: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('stripchat: loaded saved cookies');
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
    for (const { proxy } of activeProxies.clear()) {
      await proxy.stop().catch(() => undefined);
    }
    status.state = 'installed';
    ctx = null;
  },
};

export default plugin;