/**
 * Monitoring engine types and constants.
 * The monitoring engine never contains platform-specific logic.
 */

export const MONITORING_STATES = [
  'queued',
  'waiting',
  'checking',
  'live',
  'offline',
  'paused',
  'retrying',
  'failed',
  'disabled',
] as const;

export type MonitoringState = (typeof MONITORING_STATES)[number];

export const MONITORING_EVENTS = [
  'creator-checked',
  'creator-live',
  'creator-offline',
  'plugin-error',
  'authentication-failed',
  'retry-scheduled',
  'worker-started',
  'worker-stopped',
  'scheduler-started',
  'scheduler-stopped',
  'stats-updated',
] as const;

export type MonitoringEventType = (typeof MONITORING_EVENTS)[number];

export interface MonitoringJob {
  id: string;
  creatorId: string;
  pluginId: string;
  state: MonitoringState;
  priority: number;
  intervalMs: number;
  nextCheckAt: number;
  lastCheckAt?: number;
  lastResult?: MonitoringCheckResult;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringCheckResult {
  isLive: boolean;
  title?: string;
  thumbnail?: string;
  viewerCount?: number;
  streamUrl?: string;
  startedAt?: string;
  checkedAt: string;
  durationMs: number;
}

export interface MonitoringEvent {
  type: MonitoringEventType;
  creatorId?: string;
  pluginId?: string;
  jobId?: string;
  isLive?: boolean;
  error?: string;
  data?: MonitoringCheckResult;
  /** Present on `stats-updated` events: snapshot of dashboard counters. */
  stats?: MonitoringDashboardData;
  timestamp: string;
}

export interface MonitoringDashboardData {
  currentlyChecking: number;
  queuedJobs: number;
  liveCreators: number;
  offlineCreators: number;
  health: MonitoringHealth;
  averageCheckDurationMs: number;
  nextScheduledCheck: number;
}

export interface MonitoringHealth {
  totalJobs: number;
  activeJobs: number;
  failedJobs: number;
  pausedJobs: number;
  averageCheckDurationMs: number;
  lastCheckAt?: string;
  uptime: number;
}

export interface SchedulerConfig {
  /** Base polling interval in ms. */
  baseIntervalMs: number;
  /** Maximum concurrent checks. */
  maxConcurrent: number;
  /** Maximum retry attempts for failed checks. */
  maxRetries: number;
  /** Initial backoff delay in ms. */
  initialBackoffMs: number;
  /** Maximum backoff delay in ms. */
  maxBackoffMs: number;
  /** Idle timeout before stopping workers in ms. */
  workerIdleTimeoutMs: number;
}
