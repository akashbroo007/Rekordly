import { describe, expect, it } from 'vitest';
import { MonitoringService } from './service';
import type { MonitoringRepo } from '@rekordly/database';
import type { NotificationService } from '../services/notification-service';

/**
 * ponytail: `creator-live` used to fire on EVERY successful check while a
 * creator stayed live — with a 10–30s interval the user got one "X is LIVE"
 * Telegram/Discord push per poll. It must be an EDGE event: emit once on the
 * offline→live transition, stay silent while still live, and emit
 * `creator-offline` only on the live→offline transition.
 *
 * The tests use a 1s check interval so the scheduler's 5s tick picks the job
 * up on consecutive ticks (one check per tick).
 */
describe('MonitoringService live/offline edge detection', () => {
  function makeService(getStatus: () => { isLive: boolean }) {
    const repo = {
      create: () => undefined,
      update: () => undefined,
      remove: () => undefined,
      setState: () => undefined,
      setError: () => undefined,
      incrementAttempts: () => undefined,
      setLastCheck: () => undefined,
      list: () => [],
    } as unknown as MonitoringRepo;
    const notifications = {
      send: () => undefined,
    } as unknown as NotificationService;
    const plugin = {
      status: { state: 'ready' },
      capabilities: {
        liveDetection: {
          getLiveStatus: async (): Promise<{ isLive: boolean }> => getStatus(),
        },
      },
    };
    const logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => logger,
    };
    const service = new MonitoringService({
      repo,
      pluginManager: {
        get: () => ({ instance: plugin, record: { manifest: { id: 'p' } } }),
      },
      notifications,
      logger,
      baseIntervalMs: 300_000,
    } as unknown as ConstructorParameters<typeof MonitoringService>[0]);
    return service;
  }

  it(
    'emits creator-live once per live session, not on every check',
    { timeout: 30_000 },
    async () => {
      // Stay live the whole time — the old code emitted one push PER check.
      const service = makeService(() => ({ isLive: true }));
      const live: unknown[] = [];
      const offline: unknown[] = [];
      service.on('event', (e) => {
        if (e.type === 'creator-live') live.push(e);
        if (e.type === 'creator-offline') offline.push(e);
      });

      await service.start();
      // 1s interval: the job is due on every scheduler tick (5s), so ~3
      // checks run over 16s. Edge detection must emit exactly one live event.
      service.addCreator('youtube:cnn', 'youtube', 1_000);
      await new Promise((r) => setTimeout(r, 16_000));

      expect(live).toHaveLength(1);
      expect(offline).toHaveLength(0);

      // rearmLive (host calls this when an auto-record attempt fails) makes
      // the NEXT check re-emit once — the pipeline self-heals without spam.
      service.rearmLive('youtube:cnn');
      await new Promise((r) => setTimeout(r, 6_000));
      expect(live).toHaveLength(2);
      await service.stop();
    },
  );

  it(
    'emits creator-offline once on live→offline, then live again on return',
    { timeout: 40_000 },
    async () => {
      let live = true;
      const service = makeService(() => ({ isLive: live }));
      const liveEvents: unknown[] = [];
      const offlineEvents: unknown[] = [];
      service.on('event', (e) => {
        if (e.type === 'creator-live') liveEvents.push(e);
        if (e.type === 'creator-offline') offlineEvents.push(e);
      });

      await service.start();
      service.addCreator('youtube:cnn2', 'youtube', 1_000);

      // Phase 1: live (checks at ~5s and ~10s) — exactly one live event.
      await new Promise((r) => setTimeout(r, 11_000));
      expect(liveEvents).toHaveLength(1);
      expect(offlineEvents).toHaveLength(0);

      // Phase 2: go offline (checks at ~15s and ~20s) — one offline event.
      live = false;
      await new Promise((r) => setTimeout(r, 10_000));
      expect(offlineEvents).toHaveLength(1);

      // Phase 3: back live (checks at ~25s and ~30s) — one more live event.
      live = true;
      await new Promise((r) => setTimeout(r, 10_000));
      expect(liveEvents).toHaveLength(2);
      await service.stop();
    },
  );
});
