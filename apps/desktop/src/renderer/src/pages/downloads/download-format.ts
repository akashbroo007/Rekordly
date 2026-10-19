/**
 * Pure presentation helpers for the Downloads page — URL → site badges,
 * folder shortening (home path masked), queue positions and the
 * "720p · MP4" style quality/format read-outs. No behavior here: the main
 * process stays the single owner of the download queue.
 */
import type { DownloadQueueItemDto } from '@rekordly/shared/contracts';

import { maskHomeDir } from '../uploads/upload-errors';

/** "https://www.youtube.com/watch?v=…" → "YouTube" — not parseable → "?" */
function siteHostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Stable site identity used for the badge, the source filter and the
 * fallback tint. Mirrors DownloadManager.deriveSiteFolder (second-level
 * host label: "youtube" of youtube.com) so filter ids stay consistent with
 * the folders the engine creates. A download queued from a creator already
 * carries its pluginId — that wins when present.
 */
export function siteIdFor(item: DownloadQueueItemDto): string {
  if (item.pluginId !== null && item.pluginId !== undefined && item.pluginId !== '') {
    return item.pluginId;
  }
  const host = siteHostFromUrl(item.url);
  if (host === null) return 'misc';
  const parts = host.split('.').filter((p) => p !== '');
  const label = parts.length >= 2 ? parts[parts.length - 2] ?? 'misc' : parts[0] ?? 'misc';
  return label.replace(/[^a-z0-9_-]/g, '').slice(0, 64) || 'misc';
}

/** Badge text — the site host itself, lowercase (never all-caps URLs). */
export function siteNameFor(item: DownloadQueueItemDto): string {
  return siteHostFromUrl(item.url) ?? 'unknown source';
}

/** Bold row title: probed/added title, falling back to the file name. */
export function downloadTitleFor(item: DownloadQueueItemDto): string {
  const title = item.title ?? '';
  const trimmed = title.trim();
  return trimmed !== '' ? trimmed : item.fileName;
}

/**
 * "720p · MP4" — quality plus format. Audio-only rows read "MP3"; direct
 * (http) files fall back to their extension-like quality field, and unknown
 * shapes render nothing (null → the split separator is skipped).
 */
export function formatLabelFor(item: DownloadQueueItemDto): string | null {
  if (item.audioOnly) return 'MP3';
  const quality = (item.quality ?? '').trim().toLowerCase();
  if (quality === '' || quality === 'best') return null; // 'best' is the default — noise
  return quality;
}

/**
 * Destination folder, shortened for the meta line and masked so the
 * Windows/Unix account name never reaches the screen:
 * "C:\\Users\\you\\Downloads\\youtube" → "~\\Downloads\\youtube",
 * further trimmed to its last two segments ("…\Downloads\youtube").
 */
export function folderLabelFor(destination: string): string | null {
  if (destination.trim() === '') return null;
  const masked = maskHomeDir(destination);
  const segments = masked.split(/[\\/]/).filter((s) => s !== '');
  if (segments.length === 0) return null;
  if (segments.length <= 2) return segments.join('\\');
  return `…\\${segments[segments.length - 2]}\\${segments[segments.length - 1]}`;
}

/** Full destination for the tooltip — still home-masked. */
export function folderTooltipFor(destination: string): string | null {
  const masked = maskHomeDir(destination);
  return masked.trim() === '' ? null : masked;
}

/** Row title for tooltips — title falls back to the file name. */
export function titleTooltipFor(item: DownloadQueueItemDto): string {
  const title = (item.title ?? '').trim();
  return title !== '' ? `${title} · ${item.fileName}` : item.fileName;
}

export const ACTIVE_DOWNLOAD_STATUSES: readonly string[] = ['queued', 'downloading', 'paused'];

/** "Position 3 in queue" — rank among queued rows in scheduler order. */
export function queuePositionOf(item: DownloadQueueItemDto, all: DownloadQueueItemDto[]): number | null {
  if (item.status !== 'queued') return null;
  const queued = all
    .filter((i) => i.status === 'queued')
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  const index = queued.findIndex((i) => i.id === item.id);
  return index >= 0 ? index + 1 : null;
}

/** Human priority chip: -1 High · 0 Normal · 1 Low. */
export function priorityLabel(priority: number): 'High' | 'Normal' | 'Low' {
  if (priority < 0) return 'High';
  if (priority > 0) return 'Low';
  return 'Normal';
}
