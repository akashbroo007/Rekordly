/**
 * Shared live-catalog cache.
 *
 * ponytail: the web catalog (the "Live" grid's own feed, 100 items/page)
 * is the only public source of viewer counts, thumbnails and tags — and it
 * covers ALL live creators at once. Per-creator monitoring checks reuse one
 * page walk per TTL window instead of each check scanning on its own:
 * a 5-creator monitor would otherwise hammer the same request N times per
 * minute. The cache is keyed by streamId (and by lowercased alias for
 * search), refreshed every CATALOG_TTL_MS with a single in-flight walk.
 */
import { fetchCatalogPage, type ApiContext, type CatalogItem } from './api';

const CATALOG_TTL_MS = 25_000;
const MAX_PAGES = 4;
const PAGE_SIZE = 100;

interface CacheState {
  byStreamId: Map<string, CatalogItem>;
  byAlias: Map<string, CatalogItem>;
  fetchedAt: number;
  inflight: Promise<void> | null;
}

const state: CacheState = {
  byStreamId: new Map(),
  byAlias: new Map(),
  fetchedAt: 0,
  inflight: null,
};

function ingest(items: CatalogItem[], fetchedAt: number): void {
  for (const item of items) {
    const sid = item.encryptedStreamId;
    if (typeof sid === 'string' && sid !== '') state.byStreamId.set(sid, item);
    const alias = item.broadcaster?.alias;
    if (typeof alias === 'string' && alias !== '') state.byAlias.set(alias.toLowerCase(), item);
  }
  void fetchedAt;
}

async function walk(ctx: ApiContext, agent: Agent | null): Promise<void> {
  state.byStreamId = new Map();
  state.byAlias = new Map();
  for (let page = 0; page < MAX_PAGES; page++) {
    const items = await fetchCatalogPage(ctx, page * PAGE_SIZE, agent);
    ingest(items, 0);
    if (items.length < PAGE_SIZE) break;
  }
}

type Agent = import('node:http').Agent;

/** Bring the cache up-to-date (single walk at a time). */
export async function ensureCatalogCache(ctx: ApiContext, agent: Agent | null = null): Promise<void> {
  if (Date.now() - state.fetchedAt < CATALOG_TTL_MS && state.inflight === null) return;
  if (state.inflight === null) {
    state.inflight = (async () => {
      try {
        await walk(ctx, agent);
        state.fetchedAt = Date.now();
      } finally {
        state.inflight = null;
      }
    })();
  }
  await state.inflight;
}

/** Catalog entry for a live stream id (from cache after ensureCatalogCache). */
export function catalogItemForStream(streamId: string): CatalogItem | undefined {
  return state.byStreamId.get(streamId);
}

/** Catalog entry by alias (lowercase match). */
export function catalogItemForAlias(alias: string): CatalogItem | undefined {
  return state.byAlias.get(alias.toLowerCase());
}

/** All cached items (search/discovery). */
export function cachedItems(): CatalogItem[] {
  return [...state.byStreamId.values()];
}

/** Drop the cache (network errors should not outlive one tick). */
export function invalidateCatalogCache(): void {
  state.byStreamId = new Map();
  state.byAlias = new Map();
  state.fetchedAt = 0;
}

/** Pull the plausible tag strings out of a catalog item. */
export function tagsFromItem(item: CatalogItem): string[] {
  const tags = item.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 40).slice(0, 10);
}
