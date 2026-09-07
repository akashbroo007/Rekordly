import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * ponytail: pages previously relied on polling (refetchInterval) to pick up
 * recording changes, causing multi-second UI lag. The main process already
 * pushes RecordingEvents over IPC — this bridge invalidates every affected
 * react-query cache entry the moment an event lands, so dashboards update
 * instantly.
 */
const INVALIDATED_KEYS: readonly string[][] = [
  ['dashboard-stats'],
  ['monitoring-dashboard'],
  ['monitoring-status'],
  ['recording-jobs'],
  ['recordings-recent'],
  ['recordings-list'],
  ['logs-recent'],
  ['storage-stats'],
];

export function useRecordingEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = window.desktop.recording.onEvent(() => {
      for (const key of INVALIDATED_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    });
    return unsubscribe;
  }, [queryClient]);
}