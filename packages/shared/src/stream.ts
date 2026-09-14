/**
 * Standard Stream Object: the only contract between plugins and the recorder.
 * The recorder understands nothing beyond this shape.
 */

export type HttpHeaders = Record<string, string>;

export interface HttpCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: string;
}

export interface StreamQualityOption {
  id: string;
  label: string;
  format?: string;
  resolution?: string;
  bitrate?: number;
  isBest?: boolean;
}

export interface StreamMetadata {
  description?: string;
  category?: string;
  tags?: string[];
  resolution?: string;
  [key: string]: unknown;
}

export interface StreamObject {
  creatorId: string;
  creatorName: string;
  platformId: string;
  title: string;
  streamUrl: string;
  thumbnail?: string;
  metadata?: StreamMetadata;
  qualityOptions?: StreamQualityOption[];
  headers?: HttpHeaders;
  cookies?: HttpCookie[];
  startedAt?: string;
  /**
   * ponytail: HTTP proxy URL for the recorder's child processes — when the
   * host proxied the plugin's requests (e.g. embedded Tor for an ISP-blocked
   * site), the recording child (ffmpeg `-proxy` / yt-dlp `--proxy`) must use
   * the same route or segment fetches fail while detection succeeded.
   */
  proxyUrl?: string;
}

export const RECORDING_STATES = [
  'queued',
  'preparing',
  'recording',
  'paused',
  'verifying',
  'completed',
  'indexed',
  'failed',
  'cancelled',
] as const;

export type RecordingState = (typeof RECORDING_STATES)[number];
