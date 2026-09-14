import { describe, expect, it } from 'vitest';
import { MonitoringService } from './service';
import type { MonitoringRepo } from '@rekordly/database';
import type { NotificationService } from '../services/notification-service';

/**
 * ponytail: a DEGRADED live check (site unreachable) carries `unknown`.
 * The service must NOT emit `creator-offline` for it — the app wiring
 * finalizes active recordings on that event — and must not flip the job
 * state or count a failure. Verified production bug: a 15-min-capped
 * BongaCams recording was finalized after ~5min with 21s of media by a
 * degraded check while the site was unreachable.
 */
describe('MonitoringService degraded (unknown) checks', () => {
  interface Harness {
    service: MonitoringService;
    updates: Array<{ id: string; patch: Record<string, unknown> }>;
    sent: Array<{ title: string }>;
  }

  function makeHarness(liveStatus: { isLive: boolean; unknown?: boolean }): Harness {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const sent: Array<{ title: string }> = [];
    const repo = {
      create: () => undefined,
      update: (id: string, patch: Record<string, unknown>) => {
        updates.push({ id, patch });
      },
      remove: () => undefined,
      setState: () => undefined,
      setError: () => undefined,
      incrementAttempts: () => undefined,
      setLastCheck: () => undefined,
      list: () => [],
    } as unknown as MonitoringRepo;
    const notifications = {
      send: (n: { title: string }): void => {
        sent.push(n);
      },
    } as unknown as NotificationService;
    const plugin = {
      status: { state: 'ready' },
      capabilities: {
        liveDetection: {
          getLiveStatus: async (): Promise<{ isLive: boolean; unknown?: boolean }> => liveStatus,
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
      // ponytail: only `get()` is exercised by checkCreator — cast through
      // unknown since the harness satisfies just the used surface.
      pluginManager: {
        get: () => ({ instance: plugin, record: { manifest: { id: 'p' } } }),
      },
      notifications,
      logger,
      baseIntervalMs: 300_000,
    } as unknown as ConstructorParameters<typeof MonitoringService>[0]);
    return { service, updates, sent };
  }

  it(
    'keeps state, emits no offline event, and retries soon on an unknown result',
    { timeout: 20_000 },
    async () => {
      const { service, updates, sent } = makeHarness({ isLive: false, unknown: true });
      const events: Array<{ type: string }> = [];
      service.on('event', (e) => {
        if (e.type !== 'stats-updated') events.push(e as { type: string });
      });
      await service.start();
      service.addCreator('bongacams:model', 'bongacams', 300_000);
      // the scheduler's first tick runs within ~5s
      await new Promise((r) => setTimeout(r, 5_600));
      await service.stop();

      const job = service.getJobs()[0]!;
      expect(events.filter((e) => e.type === 'creator-offline')).toHaveLength(0);
      expect(events.filter((e) => e.type === 'creator-live')).toHaveLength(0);
      expect(sent).toHaveLength(0); // no "Monitoring check failed" notification
      expect(job.state).toBe('queued'); // back in rotation — neither live nor offline
      expect(job.attempts).toBe(0); // not a failure
      // next check is scheduled soon (retry), not after a full interval
      expect(updates.some((u) => typeof u.patch.nextCheckAt === 'number')).toBe(true);
      expect(job.nextCheckAt).toBeLessThanOrEqual(Date.now() + 60_000 + 5_000);
    },
  );

  it(
    'still finalizes on a definitive offline answer (recordings SHOULD stop then)',
    { timeout: 20_000 },
    async () => {
      const { service } = makeHarness({ isLive: false });
      const events: Array<{ type: string }> = [];
      service.on('event', (e) => {
        if (e.type !== 'stats-updated') events.push(e as { type: string });
      });
      await service.start();
      service.addCreator('bongacams:model2', 'bongacams', 300_000);
      await new Promise((r) => setTimeout(r, 5_600));
      await service.stop();
      expect(events.filter((e) => e.type === 'creator-offline')).toHaveLength(1);
    },
  );
});
