import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitorService } from './network-monitor';
import { ProcessMonitorService } from './process-monitor';
import { silentLogger } from '../recording/test-harness';

describe('mass-mode monitor skip (plan §10)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('process monitor polls once, then skips subprocess work until the mass window elapses', async () => {
    const getActivePids = vi.fn((): Array<{ pid: number; type: 'ffmpeg' }> => []);
    const monitor = new ProcessMonitorService({
      logger: silentLogger,
      getActivePids,
      pollIntervalMs: 20,
      massPollIntervalMs: 10_000,
      isMassLoad: () => true,
    });
    monitor.start();
    expect(getActivePids).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    // 10 more base ticks — all gated, no further PID reads.
    expect(getActivePids).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getActivePids.mock.calls.length).toBeGreaterThan(1);
    monitor.stop();
  });

  it('process monitor keeps the base cadence when load is normal', async () => {
    const getActivePids = vi.fn((): Array<{ pid: number; type: 'ffmpeg' }> => []);
    const monitor = new ProcessMonitorService({
      logger: silentLogger,
      getActivePids,
      pollIntervalMs: 20,
      isMassLoad: () => false,
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(100);
    // Immediate poll + ~5 ticks, none gated.
    expect(getActivePids.mock.calls.length).toBeGreaterThanOrEqual(5);
    monitor.stop();
  });

  it('network monitor skips counter reads until the mass window elapses', async () => {
    const monitor = new NetworkMonitorService({
      logger: silentLogger,
      pollIntervalMs: 20,
      massPollIntervalMs: 10_000,
      isMassLoad: () => true,
    });
    const spy = vi
      .spyOn(monitor as unknown as { getNetworkCounters: () => Promise<{ bytesReceived: number; bytesSent: number }> }, 'getNetworkCounters')
      .mockResolvedValue({ bytesReceived: 0, bytesSent: 0 });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(spy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    monitor.stop();
  });
});
