/**
 * HLS master playlist handling for Tango's cinema edge.
 *
 * masterListUrl looks like https://cinema-<edge>.tango.me/v2/<32-hex>/master.m3u8 —
 * the variant entries already embed the per-broadcast token (m=<hex>) and
 * tech=lhls, e.g. /v2/<vhash>/live.m3u8?m=<mhash>&tech=lhls&label=pwatcf.
 * The lhls playlists carry classic EXTINF + .ts segment lines, so they read
 * as plain HLS once rewritten to a local relay.
 */
import * as http from 'node:http';
import * as https from 'node:https';
import { request, HLS_TIMEOUT_MS, type TangoResponse } from './http';
import type { Agent } from 'node:http';

export interface StreamVariant {
  url: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
}

/** Parse #EXT-X-STREAM-INF variants out of a master playlist body. */
export function parseVariants(masterUrl: string, body: string): StreamVariant[] {
  const lines = body.split('\n').map((l) => l.trim());
  const variants: StreamVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('#EXT-X-STREAM-INF:')) continue;
    const rawUrl = lines[i + 1];
    if (!rawUrl || rawUrl.startsWith('#')) continue;
    const attrs = lines[i]!.slice('#EXT-X-STREAM-INF:'.length);
    const bandwidth = parseInt(attrs.match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const codecs = attrs.match(/CODECS="([^"]*)"/)?.[1];
    const resolution = attrs.match(/RESOLUTION=([0-9]+x[0-9]+)/)?.[1];
    const url = /^https?:/i.test(rawUrl) ? rawUrl : new URL(rawUrl, masterUrl).toString();
    variants.push({ url, bandwidth, resolution, codecs });
  }
  return variants;
}

/**
 * ponytail (mirrors the BongaCams/CamSoda plugins): prefer the
 * highest-bandwidth H.264 variant — the master itself would make the HLS
 * demuxer open every variant at once and the copy-muxer drops packets;
 * recording the single best variant works and is lighter on the edge.
 */
export function pickBestVariant(variants: StreamVariant[]): StreamVariant {
  const score = (v: StreamVariant): number => {
    let s = v.bandwidth;
    if (/avc1/i.test(v.codecs ?? '')) s += 5_000_000;
    else if (/av01|hvc1|hev1/i.test(v.codecs ?? '')) s -= 5_000_000;
    return s;
  };
  return [...variants].sort((a, b) => score(b) - score(a))[0]!;
}

/**
 * Fetch a master playlist and resolve the best variant.
 *
 * ponytail: offline and transport failures are different signals. The edge
 * answers 401 when a URL's short-lived token aged out (and 404 when the
 * broadcast is gone) — the relay treats those as refresh/remint prompts,
 * but this helper reports definitive-offline as `null` instead of throwing.
 */
export async function fetchMasterVariants(
  masterUrl: string,
  headers: Record<string, string> = {},
  agent: Agent | null = null,
): Promise<{ variants: StreamVariant[]; response: TangoResponse } | null> {
  const res = await request(masterUrl, { timeoutMs: HLS_TIMEOUT_MS, headers, agent });
  if (res.status === 404) return null;
  if (res.status !== 200 || !res.text().includes('#EXTM3U')) return null;
  const variants = parseVariants(masterUrl, res.text());
  return variants.length === 0 ? null : { variants, response: res };
}

/** Pull the numeric sequence out of a Tango segment path (/…/<seq>.ts). */
export function segmentSeq(segmentUrl: string): number | null {
  const m = /\/(\d{2,10})\.ts(?:$|\?)/.exec(segmentUrl);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

/** Fetch raw bytes (segments) — used by the relay. */
export function fetchBinary(
  url: string,
  headers: Record<string, string>,
  agent: Agent | null = null,
  timeoutMs = HLS_TIMEOUT_MS,
): Promise<{ status: number; body: Buffer } | null> {
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === 'https:' ? https : http;
    const req = mod.request(url, { headers, timeout: timeoutMs, ...(agent ? { agent } : {}) }, (res) => {
      const statusCode = res.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchBinary(new URL(res.headers.location, url).toString(), headers, agent, timeoutMs));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}
