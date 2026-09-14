import { describe, expect, it, vi } from 'vitest';
import { ProxyRegistry, type ManagedProxy } from './proxy-registry';

class FakeProxy implements ManagedProxy {
  stop = vi.fn(async (): Promise<void> => undefined);
  constructor(
    private browser: boolean,
    private at: number,
  ) {}
  holdsBrowser(): boolean {
    return this.browser;
  }
  lastActivityAt(): number {
    return this.at;
  }
  releaseBrowser(): void {
    this.browser = false;
  }
}

describe('ProxyRegistry', () => {
  it('replaces the same key instead of growing (same-model re-extract)', () => {
    const registry = new ProxyRegistry<FakeProxy>(2);
    const first = new FakeProxy(true, 1000);
    expect(registry.set('alice', first)).toEqual([]);
    const second = new FakeProxy(true, 2000);
    const evicted = registry.set('alice', second);
    expect(evicted.map((e) => e.key)).toEqual(['alice']);
    expect(evicted[0]?.proxy).toBe(first);
    expect(registry.size).toBe(1);
  });

  it('never evicts the just-registered key', () => {
    const registry = new ProxyRegistry<FakeProxy>(1, 0);
    registry.set('a', new FakeProxy(true, 1000));
    // 'b' is newest; the older 'a' goes even though the cap is 1.
    const evicted = registry.set('b', new FakeProxy(true, 2000));
    expect(evicted.map((e) => e.key)).toEqual(['a']);
    expect(registry.has('b')).toBe(true);
  });

  it('lets a burst through while proxies are warming up (no startup kills)', () => {
    const now = Date.now();
    const registry = new ProxyRegistry<FakeProxy>(2, 120_000);
    expect(registry.set('a', new FakeProxy(true, now))).toEqual([]);
    expect(registry.set('b', new FakeProxy(true, now))).toEqual([]);
    // Third concurrent startup overflows instead of killing a live one.
    expect(registry.set('c', new FakeProxy(true, now))).toEqual([]);
    expect(registry.size).toBe(3);
  });

  it('evicts the least-recently-active browser-holder past grace', () => {
    const now = Date.now();
    const registry = new ProxyRegistry<FakeProxy>(2, 120_000);
    registry.set('old', new FakeProxy(true, now - 500_000));
    registry.set('mid', new FakeProxy(true, now - 300_000));
    const evicted = registry.set('new', new FakeProxy(true, now));
    expect(evicted.map((e) => e.key)).toEqual(['old']);
    expect(registry.has('mid')).toBe(true);
    expect(registry.has('new')).toBe(true);
  });

  it('never evicts browser-released (lightweight) proxies to satisfy the cap', () => {
    const now = Date.now();
    const registry = new ProxyRegistry<FakeProxy>(1, 0);
    const light = new FakeProxy(false, now - 999_999);
    registry.set('light', light);
    // A new browser-holder arrives: only it is counted, so nothing is evicted.
    expect(registry.set('heavy', new FakeProxy(true, now))).toEqual([]);
    expect(registry.size).toBe(2);
    // A second browser-holder evicts the older holder, never the lightweight.
    const evicted = registry.set('heavy2', new FakeProxy(true, now + 1));
    expect(evicted.map((e) => e.key)).toEqual(['heavy']);
    expect(registry.has('light')).toBe(true);
  });

  it('delete and clear report for the owner to stop', () => {
    const registry = new ProxyRegistry<FakeProxy>(2);
    const proxy = new FakeProxy(true, 1000);
    registry.set('a', proxy);
    registry.delete('a');
    expect(registry.has('a')).toBe(false);
    registry.set('b', new FakeProxy(true, 1000));
    expect(registry.clear().map((e) => e.key)).toEqual(['b']);
    expect(registry.size).toBe(0);
  });
});
