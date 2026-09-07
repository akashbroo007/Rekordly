import type { Logger } from '@rekordly/shared';

export interface BrowserPoolOptions {
  maxPages: number;
  idleTimeoutMs: number;
  maxMemoryMb: number;
}

export interface ManagedPage {
  id: string;
  inUse: boolean;
  lastUsedAt: number;
  createdAt: number;
}

/**
 * Shared browser pool for monitoring checks.
 * Reuses a single browser instance with multiple contexts.
 * Never launches a browser per creator.
 *
 * ponytail: Playwright browser is launched lazily on first use.
 * Actual Playwright integration will be added when plugins need real browser automation.
 * For now, the pool manages page lifecycle metadata; plugins handle their own browser usage.
 */
export class BrowserPool {
  private readonly pages = new Map<string, ManagedPage>();
  private readonly options: BrowserPoolOptions;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    options: Partial<BrowserPoolOptions> = {},
    private readonly logger: Logger,
  ) {
    this.options = {
      maxPages: options.maxPages ?? 10,
      idleTimeoutMs: options.idleTimeoutMs ?? 300_000,
      maxMemoryMb: options.maxMemoryMb ?? 512,
    };
  }

  start(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.idleTimeoutMs / 2);
    this.logger.info({ maxPages: this.options.maxPages }, 'browser pool started');
  }

  stop(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.pages.clear();
    this.logger.info('browser pool stopped');
  }

  acquire(): ManagedPage | null {
    if (this.pages.size >= this.options.maxPages) {
      // Reuse the oldest idle page
      const idle = [...this.pages.values()].filter((p) => !p.inUse).sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
      if (idle === undefined) {
        this.logger.debug('browser pool: no idle pages available');
        return null;
      }
      idle.inUse = true;
      idle.lastUsedAt = Date.now();
      this.logger.debug({ pageId: idle.id }, 'browser pool: reused idle page');
      return idle;
    }

    const page: ManagedPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      inUse: true,
      lastUsedAt: Date.now(),
      createdAt: Date.now(),
    };
    this.pages.set(page.id, page);
    this.logger.debug({ pageId: page.id, total: this.pages.size }, 'browser pool: acquired new page');
    return page;
  }

  release(pageId: string): void {
    const page = this.pages.get(pageId);
    if (page !== undefined) {
      page.inUse = false;
      page.lastUsedAt = Date.now();
      this.logger.debug({ pageId }, 'browser pool: released page');
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, page] of this.pages) {
      if (!page.inUse && now - page.lastUsedAt > this.options.idleTimeoutMs) {
        this.pages.delete(id);
        this.logger.debug({ pageId: id }, 'browser pool: cleaned up idle page');
      }
    }
  }

  stats(): { total: number; active: number; idle: number } {
    const all = [...this.pages.values()];
    return {
      total: all.length,
      active: all.filter((p) => p.inUse).length,
      idle: all.filter((p) => !p.inUse).length,
    };
  }
}
