import { useQuery } from '@tanstack/react-query';
import { Activity, Cpu, MemoryStick, Puzzle, Video, Download, Upload } from 'lucide-react';
import { formatBytes } from '@rekordly/shared/format';

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function StatusBar() {
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => window.desktop.app.getInfo(),
    staleTime: Infinity,
  });

  const { data: stats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => window.desktop.app.getSystemStats(),
    refetchInterval: 2000,
  });

  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
    refetchInterval: 10000,
  });

  const activeRecordings = stats?.activeRecordings ?? 0;
  const recordingStatus = activeRecordings > 0 ? `Recording (${activeRecordings})` : 'Idle';
  const totalCpu = (stats?.cpuUsage ?? 0) + (stats?.childCpuUsage ?? 0);
  const totalMemory = (stats?.memoryRss ?? 0) + (stats?.childMemoryBytes ?? 0);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-panel px-4 text-[11px] text-foreground-muted">
      <span className="flex items-center gap-1">
        <Puzzle size={12} aria-hidden="true" /> {plugins?.length ?? 0} plugins
      </span>
      <span className="flex items-center gap-1">
        <Video size={12} aria-hidden="true" /> {activeRecordings} recordings
      </span>
      <span className="flex items-center gap-1">
        <Cpu size={12} aria-hidden="true" /> CPU{' '}
        {stats === undefined ? '\u2014' : `${Math.round(totalCpu)}%`}
      </span>
      <span className="flex items-center gap-1">
        <MemoryStick size={12} aria-hidden="true" />
        {stats === undefined ? '\u2014' : formatBytes(totalMemory)}
      </span>
      {(stats?.networkDownloadSpeed ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Download size={12} aria-hidden="true" />
          {formatSpeed(stats!.networkDownloadSpeed)}
        </span>
      )}
      {(stats?.networkUploadSpeed ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Upload size={12} aria-hidden="true" />
          {formatSpeed(stats!.networkUploadSpeed)}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Activity size={12} aria-hidden="true" /> {recordingStatus}
      </span>
      <span className="ml-auto">{info === undefined ? '' : `v${info.version}`}</span>
    </footer>
  );
}
