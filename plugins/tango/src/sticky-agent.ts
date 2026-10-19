/**
 * PIN (POP forensics): Tango's HLS edge is Fastly whose auth decisions are
 * made per-POP — a visitor "seat" minted on `cache-MAA` is invisible to
 * `cache-BOM`, so requests must land on ONE edge node or they 401
 * intermittently. Browsers get this for free (one H2 connection = one POP);
 * node opens a fresh connection per request and DNS rotates between
 * anycast pairs. `createStickyAgent` pins every URL this agent connects to
 * onto the FIRST resolved IP (re-resolved only when the pin ages out) and
 * keeps idle sockets alive so the relay's playlist/segment fetches reuse
 * the same TCP connection to the same POP.
 */
import * as dns from 'node:dns';
import * as https from 'node:https';

export interface StickyAgent {
  agent: https.Agent;
  /** Force the next lookup to re-resolve (e.g. after an edge outage). */
  invalidate(): void;
}

export function createStickyAgent(options: { pinTtlMs?: number; maxSockets?: number } = {}): StickyAgent {
  const pinTtlMs = options.pinTtlMs ?? 240_000;
  let pinnedIp: string | null = null;
  let pinnedHost = '';
  let pinnedAt = 0;
  const lookup = (host: string, _options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void): void => {
    if (pinnedHost === host && pinnedIp !== null && Date.now() - pinnedAt < pinTtlMs) {
      callback(null, [{ address: pinnedIp, family: 4 }]);
      return;
    }
    dns.promises
      .resolve4(host)
      .then((ips) => {
        const first = ips[0];
        if (first === undefined) throw new Error(`no A records for ${host}`);
        pinnedIp = first;
        pinnedHost = host;
        pinnedAt = Date.now();
        callback(null, [{ address: first, family: 4 }]);
      })
      .catch((e: NodeJS.ErrnoException) => callback(e, []));
  };
  const agent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10_000,
    maxSockets: options.maxSockets ?? 6,
    timeout: 60_000,
    lookup,
  });
  return {
    agent,
    invalidate: (): void => {
      pinnedAt = 0;
      pinnedIp = null;
    },
  };
}
