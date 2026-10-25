import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/**
 * ponytail: pages previously relied on polling (refetchInterval) to pick up
 * recording changes, causing multi-second UI lag. The main process already
 * pushes RecordingEvents over IPC — this bridge invalidates only the
 * react-query cache entries each event TYPE actually affects, so dashboards
 * update instantly without the old invalidate-EVERYTHING burst (the old map
 * invalidated 8 keys on every event; "Stop All" on 3 recordings fired 8×3+
 * refetches in one tick and choked the renderer while the main process was
 * un-sticking the kill path).
 */
const ALWAYS = ['recording-jobs', 'dashboard-stats'] as const;
/** A finished/cancelled recording lands (or changes) in the Library. */
const LIBRARY = [...ALWAYS, 'recordings-list', 'recordings-recent', 'storage-stats'] as const;

const INVALIDATED_BY_EVENT: Readonly<Record<string, readonly string[]>> = {
  'recording-queued': ALWAYS,
  'recording-started': ALWAYS,
  'recording-paused': ALWAYS,
  'recording-resumed': ALWAYS,
  'recording-cancelled': [...ALWAYS, 'recordings-list', 'recordings-recent'],
  'recording-finalized': ALWAYS,
  'recording-completed': LIBRARY,
  'recording-failed': LIBRARY,
  'recording-segment-finished': LIBRARY,
  // Background verification enriches the job row, then the Library row's
  // thumbnail — flush both, nothing else.
  'verification-started': ALWAYS,
  'verification-completed': [...LIBRARY],
  // ponytail: batch "Record All Live" heartbeat — it carries counting state
  // for the dialog only; every actual start fires its own queued/started
  // events, so invalidating on the heartbeat would just double the churn.
  'record-all-progress': [],
};

function invalidate(queryClient: QueryClient, key: string): void {
  void queryClient.invalidateQueries({ queryKey: [key] });
}

export function useRecordingEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = window.desktop.recording.onEvent((event) => {
      // ponytail: unknown event types keep the always-fresh set (job rows and
      // dashboard counters cover every lifecycle mutation safely).
      for (const key of INVALIDATED_BY_EVENT[event.type] ?? ALWAYS) {
        invalidate(queryClient, key);
      }
    });
    return unsubscribe;
  }, [queryClient]);
}
