/**
 * HTTP-only model lookup via the app's server-side rendered room page
 * (https://app.myfreecams.com/room/<username>).
 *
 * The SSR state blob carries the SAME model shape as the FCServer websocket
 * reply ({nm, uid, vs, u:{camserv}, m:{topic, rc}}) plus profile extras
 * (tags, age, headline). It is the fallback when the chat websocket cannot
 * answer (session death, chat ports blocked) and the source for profile
 * metadata the chat protocol does not expose.
 */
import type { PluginLogger } from '@rekordly/plugin-sdk';
import { withSmartRoute, DIRECT_TIMEOUT_MS, PROXY_TIMEOUT_MS, request } from './http';
import type { MfcModel } from './fcserver';

const APP_BASE = 'https://app.myfreecams.com';

export interface MfcProfile {
  model: MfcModel;
  tags?: string[];
  headline?: string;
  avatarUrl?: string;
}

/** Extract a balanced JSON value that follows `marker` in a text blob. */
export function extractBalancedJson(text: string, marker: string): unknown {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = text.indexOf(marker === 'serverState: [' ? '[' : '{', markerIdx);
  if (start === -1) return null;
  const openCh = text[start]!;
  const closeCh = openCh === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

interface SsrUserEntry {
  type?: string;
  data?: {
    _fcs?: MfcModel;
    user?: {
      id?: number;
      slug?: string;
      name?: string;
      avatar?: number;
      blurb?: string;
      tags?: string;
    };
  };
}

function decodeTopic(model: MfcModel): MfcModel {
  // ponytail: chat-protocol topics arrive percent-encoded; the SSR blob may
  // carry them either way — normalize by decoding only when needed.
  const topic = model.m?.topic;
  if (typeof topic === 'string' && topic.includes('%')) {
    try {
      return { ...model, m: { ...model.m, topic: decodeURIComponent(topic) } };
    } catch {
      return model;
    }
  }
  return model;
}

/** Build the avatar CDN URL from a uid (photos2/<uid/100000>/<uid>/...). */
export function avatarUrlFor(uid: number): string {
  const folder = Math.floor(uid / 100_000);
  return `https://img.mfcimg.com/photos2/${folder}/${uid}/avatar.300x300.jpg`;
}

function profileFromHtml(username: string, html: string): MfcProfile | null {
  const entries = extractBalancedJson(html, 'serverState: [');
  if (!Array.isArray(entries)) return null;
  for (const entry of entries as SsrUserEntry[]) {
    if (entry?.type !== 'SERVER_SIDE_USER') continue;
    const fcs = entry.data?._fcs;
    const user = entry.data?.user;
    // ponytail: the FIRST entry is always the viewing guest ("me"); the
    // model entry carries the queried name.
    const nm = fcs?.nm ?? user?.name;
    if (typeof nm !== 'string' || nm.toLowerCase() !== username.toLowerCase()) continue;
    const model: MfcModel = {
      nm,
      uid: fcs?.uid ?? user?.id,
      vs: fcs?.vs,
      u: fcs?.u,
      m: fcs?.m,
    };
    const uid = model.uid ?? user?.id;
    const tags = typeof user?.tags === 'string' && user.tags.trim() !== ''
      ? user.tags.split(/\s+/)
      : undefined;
    return {
      model: decodeTopic(model),
      tags: tags && tags.length > 0 ? tags.slice(0, 20) : undefined,
      headline: typeof user?.blurb === 'string' && user.blurb !== '' ? user.blurb : undefined,
      avatarUrl: typeof uid === 'number' && uid > 0 ? avatarUrlFor(uid) : undefined,
    };
  }
  return null;
}

/**
 * Query one model via the SSR room page.
 * Resolves null for unknown models (HTTP 404 — definitive). A page that
 * cannot be parsed (platform change, truncated response) THROWS so callers
 * treat it as a degraded check rather than a definitive answer.
 */
export async function queryModelViaPage(
  username: string,
  identifier: string,
  logger?: PluginLogger,
): Promise<MfcProfile | null> {
  const { value: html } = await withSmartRoute(identifier, async (agent) => {
    const url = `${APP_BASE}/room/${encodeURIComponent(username)}`;
    const res = await request(url, {
      agent,
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      headers: { Accept: 'text/html', Referer: `${APP_BASE}/` },
    });
    if (res.status === 404) return '';
    if (res.status !== 200) throw new Error(`Room page returned HTTP ${res.status}`);
    return res.body;
  });
  if (html === '') {
    logger?.debug(`myfreecams: ${username} not found (room page 404)`);
    return null;
  }
  const profile = profileFromHtml(username, html);
  if (profile === null) {
    // ponytail: throw, not null — a page without model state is a degraded
    // signal (platform change / block page), never a definitive answer.
    throw new Error(`room page carried no model state for ${username}`);
  }
  return profile;
}
