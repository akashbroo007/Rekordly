export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 100 ? 0 : decimals;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00:00';
  }
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.round(value)}%`;
}
