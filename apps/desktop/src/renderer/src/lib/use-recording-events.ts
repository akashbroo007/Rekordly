import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../stores/toast-store';
import type { RecordingEventDto } from '@rekordly/shared/contracts';

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

const BUY_HINT = 'Upgrade to Pro for unlimited recording.';

/** Pro tier gate toasts — friendly, short, no jargon. */
function gateToastFor(event: RecordingEventDto): { title: string; message: string } | null {
  switch (event.type) {
    case 'recording-cap-warning':
      return {
        title: 'Recording ending soon',
        message: `This recording stops in ${String(event.data?.minutesLeft ?? 2)} minutes on the free tier. ${BUY_HINT}`,
      };
    case 'recording-cap-reached':
      return {
        title: 'Recording saved',
        message: `Saved the first 15 minutes (free-tier limit) — the file is ready in your Library. ${BUY_HINT}`,
      };
    default:
      return null;
  }
}

export function useRecordingEvents(): void {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  useEffect(() => {
    const unsubscribe = window.desktop.recording.onEvent((event) => {
      for (const key of INVALIDATED_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      const toast = gateToastFor(event);
      if (toast !== null) {
        pushToast({ level: 'warn', ...toast });
      }
    });
    return unsubscribe;
  }, [queryClient, pushToast]);
}
