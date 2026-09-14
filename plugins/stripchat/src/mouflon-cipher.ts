/**
 * ponytail: pure-Node MOUFLON v2 decoder — eliminates the headless browser
 * for segment decoding when the decryption key (pdkey) is known.
 *
 * Algorithm (confirmed against StreaMonitor / goondvr / scp-standalone):
 *   Each `#EXT-X-MOUFLON:URI:` tag carries an obfuscated segment URL whose
 *   second-to-last `_`-delimited part is the encrypted filename:
 *     1. reverse the encoded part
 *     2. base64-decode it
 *     3. XOR every byte with SHA-256(pdkey), cycled
 *   The result replaces the encoded part, yielding the real CDN URL.
 *
 * The pdkey is a hardcoded `pkey -> pdkey` pair inside Stripchat's obfuscated
 * MMP player bundle. It changes with player updates, so resolution order is:
 *   1. seed map (community-tracked: kesamom/stripchat_mouflon)
 *   2. runtime scrape of the player's chunk JS (`"<pkey>":"<pdkey>"`)
 *
 * Every decoded URL is SELF-VERIFIED (the decoded filename must contain the
 * same segment sequence number as the obfuscated one), so a stale/wrong key
 * can never poison a recording — the browser fallback simply stays active.
 */
import { createHash } from 'crypto';

/** Community-tracked pkey -> pdkey pairs (source: kesamom/stripchat_mouflon). */
const SEED_PDKEYS: Record<string, string> = {
  Zokee2OhPh9kugh4: 'Quean4cai9boJa5a',
  Zeechoej4aleeshi: 'ubahjae7goPoodi6',
  Ook7quaiNgiyuhai: 'EQueeGh2kaewa3ch',
  Fq6m2TO2ZeBkRPm9: 'xb6di1NF9EFXHUwb',
  GrRncsoByZmsiT6L: 'NigHYyOD9l4rvAEb',
  '1Dzcc6OjP73LKbtI': 'Y64UVwX5RrIWnOLp',
  N2oLovTIXb0o28Uj: 'ABE7Sj8jh3oPM2ae',
  NTK9aqcLmNFMWrpQ: 'tOcYOap4Ty1l9Jzb',
  '7uUnbD0jMCB9GH32': 'lzCQ6QBTnLpB0zMF',
  Ohi7eTRBpkAuML0l: 'kExe29N2sLFrHGqu',
  OLzu7QlySkG2fVRn: 'CsovScFH9VirSJ4Z',
};

/**
 * Decode a MOUFLON v2 obfuscated segment URI. Returns the real CDN URL, or
 * null when the input is malformed or decryption yields non-URL garbage
 * (i.e. wrong pdkey).
 */
export function decodeMouflonUri(uri: string, pdkey: string): string | null {
  const parts = uri.split('_');
  if (parts.length < 3) return null;
  const encodedPart = parts[parts.length - 2]!;
  if (encodedPart.length < 8) return null;
  try {
    const reversed = encodedPart.split('').reverse().join('');
    const data = Buffer.from(reversed + '==', 'base64');
    if (data.length === 0) return null;
    const hash = createHash('sha256').update(pdkey, 'utf-8').digest();
    const out = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i]! ^ hash[i % hash.length]!;
    }
    const decoded = out.toString('utf-8');
    // A correct decryption is a printable URL fragment; anything else
    // (control chars / non-ASCII) means the key was wrong.
    if (!/^[\x21-\x7e]+$/.test(decoded)) return null;
    return uri.replace(encodedPart, decoded);
  } catch {
    return null;
  }
}

/** Pull all `"<pkey>":"<pdkey>"` pairs out of a player JS bundle. */
export function extractPdKeysFromJs(js: string): Record<string, string> {
  const found: Record<string, string> = {};
  const re = /"([A-Za-z0-9]{12,24})"\s*:\s*"([A-Za-z0-9]{12,24})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    // pdkey pairs are adjacent same-length-ish alphanumerics; the SHA-256
    // self-verification at the call site rejects false positives anyway.
    found[m[1]!] = m[2]!;
  }
  return found;
}

export interface PdKeyResolver {
  (pkey: string): Promise<string | null>;
}

/**
 * ponytail: scrape the MMP player (the component that owns MOUFLON) for the
 * pkey's pdkey. The player version is published in the site state
 * (`"mmpVersion":"vX.Y.Z"`); the bundle lives on doppiocdn and its webpack
 * chunk map (`".u=e=>\"chunk-\"+{...}[e]+\".js\""`) lists the lazy chunks.
 * If Stripchat ever returns to embedding the key map in the bundle (as in
 * player <= 2.8.x), this finds it automatically.
 */
async function scrapeMmpPlayer(
  fetchText: (url: string) => Promise<string>,
  home: string,
  pkey: string,
  log?: (m: string) => void,
): Promise<string | null> {
  const ver = (home.match(/"mmpVersion"\s*:\s*"(v[\d.]+)"/) ?? [])[1];
  if (ver === undefined) return null;
  const origins = [
    `https://mmp.doppiocdn.com/player/mmp/${ver}`,
    `https://img.doppiocdn.com/player/mmp/${ver}`,
  ];
  for (const origin of origins) {
    try {
      const main = await fetchText(`${origin}/main.js`);
      const files = [main];
      const uIdx = main.indexOf('.u=e=>');
      if (uIdx !== -1) {
        const map = main.slice(uIdx, uIdx + 600).match(/\{([^}]+)\}/);
        if (map !== null) {
          for (const m of map[1]!.matchAll(/(\d+):"([a-f0-9]+)"/g)) {
            files.push(await fetchText(`${origin}/chunk-${m[2]}.js`));
          }
        }
      }
      for (const js of files) {
        const pair = extractPdKeysFromJs(js)[pkey];
        if (pair !== undefined) {
          log?.(`mouflon-cipher: pdkey found in MMP ${ver} bundles`);
          return pair;
        }
      }
    } catch {
      /* try next origin */
    }
  }
  return null;
}

/**
 * Build a cached pkey -> pdkey resolver. `fetchText` fetches a URL as UTF-8
 * (the plugin's browser-like httpGet). Resolution: seed map first, then the
 * MMP player bundles, then the site's own chunk references.
 */
export function createPdKeyResolver(
  fetchText: (url: string) => Promise<string>,
  getBase: () => string,
  log?: (m: string) => void,
): PdKeyResolver {
  const cache = new Map<string, string | null>();
  return async (pkey: string): Promise<string | null> => {
    const cached = cache.get(pkey);
    if (cached !== undefined) return cached;

    let pdkey: string | null = SEED_PDKEYS[pkey] ?? null;
    if (pdkey === null) {
      try {
        const home = await fetchText(getBase() + '/');
        // 1. MMP player bundles (the component that owns MOUFLON)
        pdkey = await scrapeMmpPlayer(fetchText, home, pkey, log);
        // 2. fallback: any chunk-like scripts referenced by the homepage
        if (pdkey === null) {
          const srcs = [...home.matchAll(/src="([^"]+\.js[^"]*)"/g)]
            .map((m) => m[1]!)
            .filter((s) => /chunk-|player|mmp/i.test(s))
            .slice(0, 5);
          for (const src of srcs) {
            const url = /^https?:/i.test(src) ? src : new URL(src, getBase() + '/').toString();
            const js = await fetchText(url);
            const pair = extractPdKeysFromJs(js)[pkey];
            if (pair !== undefined) {
              pdkey = pair;
              break;
            }
          }
        }
      } catch (e) {
        log?.(`mouflon-cipher: player scrape failed: ${e}`);
      }
    }
    if (pdkey !== null) {
      log?.(`mouflon-cipher: resolved pdkey for pkey ${pkey.slice(0, 6)}...`);
    } else {
      log?.(`mouflon-cipher: no pdkey for pkey ${pkey.slice(0, 6)}... — browser fallback stays active`);
    }
    cache.set(pkey, pdkey);
    return pdkey;
  };
}
