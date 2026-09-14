/**
 * Proxy registry for browser-backed site plugins (e.g. Stripchat's MOUFLON
 * proxy, or any future plugin that serves the recorder from a local server).
 *
 * USE THIS instead of hand-rolled maps whenever `extractStream` creates a
 * long-lived resource the recorder consumes AFTER we return. Two rules that
 * hand-rolled versions got wrong, both producing ffmpeg "Connection refused"
 * on 127.0.0.1:<port>:
 *
 * 1. Entries are keyed by a STABLE model key (lowercased username), never by
 *    a per-extraction URL. Every extraction mints fresh signed URLs, so
 *    keying by URL meant a re-extract of model A (manual re-record,
 *    auto-record re-resolve) added a second entry and evicted some OTHER
 *    model's live proxy.
 * 2. The cap counts only proxies still holding a heavy resource (headless
 *    browser). Once decoding moves to pure Node and the browser is released,
 *    the proxy is a tiny local server — evicting it kills a live recording
 *    to save nothing.
 */
export interface ManagedProxy {
  stop(): Promise<void>;
  /** True while the proxy still pins a heavy resource (headless browser). */
  holdsBrowser(): boolean;
  /** ms epoch of the last consumer request (least-recently-active eviction). */
  lastActivityAt(): number;
}

export interface EvictedProxy<T extends ManagedProxy> {
  key: string;
  proxy: T;
}

export class ProxyRegistry<T extends ManagedProxy> {
  private readonly entries = new Map<string, T>();

  /**
   * @param maxBrowserProxies bounds proxies still holding a heavy resource.
   * @param browserGraceMs a holder younger than this is warming up (decoding
   *   / awaiting first ffmpeg request) and is never evicted — killing
   *   startups to satisfy a number just moves the cliff. Past grace with the
   *   resource still pinned, the proxy is a decode failure and becomes
   *   evictable least-recently-active-first. When nothing is evictable the
   *   cap overflows rather than killing a live recording; the proxies' own
   *   idle watchdog still reaps truly dead ones.
   */
  constructor(
    private readonly maxBrowserProxies: number,
    private readonly browserGraceMs = 120_000,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Register (or replace) the proxy for `key`. Returns previously-held and
   * evicted proxies for the caller to stop — the registry never stops
   * anything itself, so shutdown ordering stays with the owner.
   *
   * Eviction, least-recently-active first among resource-holding proxies past
   * startup grace, never the just-registered key. Warming-up and released
   * proxies are never victims; when nothing is evictable the cap overflows
   * instead of killing a live recording.
   */
  set(key: string, proxy: T): Array<EvictedProxy<T>> {
    const evicted: Array<EvictedProxy<T>> = [];
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.entries.delete(key);
      evicted.push({ key, proxy: previous });
    }
    this.entries.set(key, proxy);

    while (this.counted() > this.maxBrowserProxies) {
      const victimKey = this.pickVictim(key, Date.now());
      if (victimKey === undefined) break;
      const victim = this.entries.get(victimKey);
      this.entries.delete(victimKey);
      if (victim !== undefined) evicted.push({ key: victimKey, proxy: victim });
    }
    return evicted;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): Array<EvictedProxy<T>> {
    const all = [...this.entries.entries()].map(([key, proxy]) => ({ key, proxy }));
    this.entries.clear();
    return all;
  }

  private counted(): number {
    let n = 0;
    for (const proxy of this.entries.values()) {
      if (proxy.holdsBrowser()) n++;
    }
    return n;
  }

  private pickVictim(excludeKey: string, now: number): string | undefined {
    // Least-recently-active holder past startup grace. Young proxies are
    // warming up; released ones are lightweight servers — neither is ever a
    // victim. Undefined overflows the cap instead of killing live.
    let victim: string | undefined;
    let victimAt = Infinity;
    for (const [key, proxy] of this.entries) {
      if (key === excludeKey || !proxy.holdsBrowser()) continue;
      const at = proxy.lastActivityAt();
      if (now - at < this.browserGraceMs) continue;
      if (at < victimAt) {
        victimAt = at;
        victim = key;
      }
    }
    return victim;
  }
}
