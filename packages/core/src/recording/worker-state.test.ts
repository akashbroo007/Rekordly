import { describe, expect, it } from 'vitest';
import { WorkerStateMachine, allowedWorkerTransitions } from './worker-state';

describe('WorkerStateMachine', () => {
  it('walks the happy path OFFLINE → RECORDING', () => {
    const machine = new WorkerStateMachine('OFFLINE');
    for (const next of ['RESOLVING', 'STARTING', 'RECORDING'] as const) {
      machine.transition(next);
    }
    expect(machine.state).toBe('RECORDING');
  });

  it('walks RECORDING → RE_RESOLVING → STARTING → RECORDING', () => {
    const machine = new WorkerStateMachine('RECORDING');
    machine.transition('RE_RESOLVING');
    machine.transition('STARTING');
    machine.transition('RECORDING');
    expect(machine.state).toBe('RECORDING');
  });

  it('walks RECORDING → RECONNECTING → RECORDING', () => {
    const machine = new WorkerStateMachine('RECORDING');
    machine.transition('RECONNECTING');
    machine.transition('RECORDING');
    expect(machine.state).toBe('RECORDING');
  });

  it('walks the stream-ended path to FINALIZING', () => {
    const machine = new WorkerStateMachine('RECORDING');
    machine.transition('STOPPING');
    machine.transition('FINALIZING');
    expect(machine.state).toBe('FINALIZING');
  });

  it('rejects illegal transitions instead of corrupting lifecycle state', () => {
    const machine = new WorkerStateMachine('QUEUED');
    expect(() => machine.transition('RECORDING')).toThrow(/Illegal worker transition: QUEUED → RECORDING/);
    expect(machine.state).toBe('QUEUED');
    expect(() => machine.transition('FINALIZING')).toThrow(/Illegal worker transition/);
  });

  it('treats FINALIZING and FAILED as terminal sinks', () => {
    expect(allowedWorkerTransitions('FINALIZING')).toEqual([]);
    expect(allowedWorkerTransitions('FAILED')).toEqual([]);
    const machine = new WorkerStateMachine('RECORDING');
    machine.transition('FAILED');
    expect(() => machine.transition('STARTING')).toThrow(/Illegal worker transition/);
  });

  it('allows QUEUED jobs to be stopped before they ever resolve', () => {
    const machine = new WorkerStateMachine();
    expect(machine.state).toBe('QUEUED');
    machine.transition('STOPPING');
    expect(machine.state).toBe('STOPPING');
  });
});
