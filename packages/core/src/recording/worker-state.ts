import { AppError } from '@rekordly/shared';
import type { WorkerState } from './backend';

/**
 * Minimum worker state machine (CONCURRENT_CAPTURE_PLAN §5).
 *
 * Source of truth for a single stream worker's lifecycle. Transitions are
 * deterministic and exhaustive — an illegal transition throws instead of
 * silently corrupting lifecycle bookkeeping. The UI never sees these states
 * directly; they drive the recorder manager's decisions.
 *
 * Legal flows:
 *   OFFLINE → RESOLVING → STARTING → RECORDING → RECONNECTING → RECORDING
 *   RECORDING → RE_RESOLVING → STARTING → RECORDING
 *   RECORDING → STREAM_ENDED → STOPPING → FINALIZING → POST_PROCESS_QUEUE
 */
const TRANSITIONS: Record<WorkerState, WorkerState[]> = {
  QUEUED: ['RESOLVING', 'STOPPING'],
  OFFLINE: ['RESOLVING', 'QUEUED'],
  RESOLVING: ['STARTING', 'STOPPING', 'FAILED'],
  STARTING: ['RECORDING', 'STOPPING', 'FAILED'],
  RECORDING: ['RECONNECTING', 'RE_RESOLVING', 'STOPPING', 'FINALIZING', 'FAILED'],
  RECONNECTING: ['RECORDING', 'STOPPING', 'FAILED'],
  RE_RESOLVING: ['STARTING', 'STOPPING', 'FAILED'],
  STOPPING: ['FINALIZING', 'FAILED'],
  FINALIZING: [],
  FAILED: [],
};

export function allowedWorkerTransitions(from: WorkerState): WorkerState[] {
  return [...TRANSITIONS[from]];
}

export class WorkerStateMachine {
  private current: WorkerState;

  constructor(initial: WorkerState = 'QUEUED') {
    this.current = initial;
  }

  get state(): WorkerState {
    return this.current;
  }

  can(to: WorkerState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  transition(to: WorkerState): void {
    if (!this.can(to)) {
      throw new AppError({
        code: 'INVALID_WORKER_TRANSITION',
        message: `Illegal worker transition: ${this.current} → ${to}`,
        recoverable: false,
      });
    }
    this.current = to;
  }
}
