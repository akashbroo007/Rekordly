/**
 * StatusChips — the conditional status area of the top bar (before Help).
 *
 * Every chip reads data the app already exposes (recording jobs, system disk
 * stats, monitoring status, the updater) — no new back-end and no new state.
 * Chips materialize only while their state is relevant, are identical on
 * every page, and at most two are visible at once: the rest collapse into a
 * single "+N" chip carrying a tooltip with the hidden labels.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tooltip } from '@rekordly/ui';
import type { UpdateStatusDto } from '@rekordly/shared/contracts';
import { formatBytes, formatDuration } from '@rekordly/shared/format';
import { useToastStore } from '../../stores/toast-store';
import { RECORDING_ROW_ACTIVE_STATUSES } from '../../pages/recordings/recording-row';
import { friendlyErrorMessage } from '../../lib/errors';
import { StatusChip, type StatusChipModel } from './status-chip';

/**
 * 1 Hz ticker — re-renders while `enabled`, used for the live elapsed time
 * on the recording chip (the ticking timer is the chip's only "activity").
 * Moved here from the old toolbar unchanged.
 */
function useTick(enabled: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
}

/** At most two chips are visible at once; the rest collapse into "+N". */
const MAX_VISIBLE = 2;

export function StatusChips() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  // --- Recording in progress — same source the Recordings page uses -------
  const { data: jobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 3000,
  });
  const activeJobs = useMemo(
    () => (jobs ?? []).filter((j) => RECORDING_ROW_ACTIVE_STATUSES.includes(j.status)),
    [jobs],
  );
  const activeCount = activeJobs.length;

  // Elapsed time of the oldest running capture — static dot, ticking timer.
  const earliestStart = useMemo(() => {
    let min: number | undefined;
    for (const job of activeJobs) {
      if (job.status !== 'recording' || job.startedAt === undefined || job.startedAt === null) continue;
      const at = new Date(job.startedAt).getTime();
      if (Number.isFinite(at) && (min === undefined || at < min)) min = at;
    }
    return min;
  }, [activeJobs]);
  useTick(earliestStart !== undefined);
  const elapsed =
    earliestStart !== undefined ? Math.max(0, Math.floor((Date.now() - earliestStart) / 1000)) : undefined;

  // --- Low disk space — free space the app already exposes ----------------
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });
  const { data: systemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => window.desktop.app.getSystemStats(),
    refetchInterval: 30_000,
  });
  // ponytail: disk free space can be unreadable (null) — show nothing
  // rather than inventing a number. Threshold = the app's own auto-record
  // guardrail; with the guardrail off, fall back to a fixed 5 GB warn line.
  const freeBytes = systemStats?.diskFreeBytes ?? null;
  const minFreeGb = settings?.autoRecordMinFreeDiskGb ?? 0;
  const diskThresholdBytes = (minFreeGb > 0 ? minFreeGb : 5) * 1024 ** 3;
  const lowDisk = freeBytes !== null && freeBytes < diskThresholdBytes;

  // --- Monitoring paused — the engine's global running state --------------
  const { data: monitorStatus } = useQuery({
    queryKey: ['monitoring-status'],
    queryFn: () => window.desktop.monitoring.getStatus(),
    refetchInterval: 5000,
  });
  const monitoringPaused = monitorStatus !== undefined && monitorStatus.running === false;
  const resumeMonitoring = (): void => {
    void window.desktop.monitoring
      .start()
      .then(() => {
        pushToast({
          level: 'info',
          title: 'Monitoring resumed',
          message: 'Live-check engine is running.',
        });
      })
      .catch((error: unknown) => {
        pushToast({
          level: 'error',
          title: 'Cannot start monitoring',
          message: friendlyErrorMessage(error),
        });
      });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-status'] });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-dashboard'] });
  };

  // --- Update available — the updater's existing event stream --------------
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusDto | null>(null);
  useEffect(() => {
    void window.desktop.updates.getStatus().then(setUpdateStatus);
    return window.desktop.updates.onEvent(setUpdateStatus);
  }, []);
  const updateAvailable = updateStatus !== null && updateStatus.supported && updateStatus.state === 'available';

  // --- Chip list (in priority order; at most two visible) -------------------
  const chips: StatusChipModel[] = [];
  if (activeCount > 0) {
    chips.push({
      id: 'recordings',
      tone: 'recording',
      leadingDot: true,
      label: `${activeCount} recording${activeCount > 1 ? 's' : ''}${elapsed !== undefined ? ` · ${formatDuration(elapsed)}` : ''}`,
      title: `${activeCount} recording${activeCount > 1 ? 's' : ''} in progress — open recordings`,
      onClick: () => navigate('/recordings?filter=active'),
    });
  }
  if (lowDisk) {
    chips.push({
      id: 'disk',
      tone: 'warning',
      leadingDot: true,
      label: `Low disk space · ${formatBytes(freeBytes!)} free`,
      title: 'Low disk space — open recording settings',
      onClick: () => navigate('/settings?tab=recording'),
    });
  }
  if (monitoringPaused) {
    chips.push({
      id: 'monitoring',
      tone: 'warning',
      leadingDot: true,
      label: 'Monitoring paused',
      title: 'Monitoring paused — resume live checks',
      onClick: resumeMonitoring,
      trailing: <span className="font-semibold">Resume</span>,
    });
  }
  if (updateAvailable) {
    chips.push({
      id: 'update',
      tone: 'accent',
      label: 'Update available',
      title: 'Update available — download it',
      onClick: () => void window.desktop.updates.download(),
    });
  }

  if (chips.length === 0) return null;

  const visible = chips.slice(0, MAX_VISIBLE);
  const overflow = chips.slice(MAX_VISIBLE);

  return (
    <div className="hidden items-center gap-2 lg:flex">
      {visible.map((chip) => (
        <StatusChip key={chip.id} chip={chip} />
      ))}
      {overflow.length > 0 && (
        <Tooltip content={overflow.map((chip) => chip.label).join(' · ')}>
          <span
            aria-label={`${overflow.length} more status update${overflow.length > 1 ? 's' : ''}`}
            className="flex h-7 cursor-default items-center rounded-md border border-border bg-elevated px-2 text-xs font-medium tabular-nums text-foreground-secondary"
          >
            +{overflow.length}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
