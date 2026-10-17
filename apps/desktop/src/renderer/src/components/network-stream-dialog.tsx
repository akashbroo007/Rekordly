import { useState } from 'react';
import { History, Link2, Play, Radio } from 'lucide-react';
import { Button, Dialog, DialogContent, Input } from '@rekordly/ui';
import type { NetworkStreamProbeDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../stores/toast-store';

/**
 * VLC-style "Open Network Stream" dialog: paste an http(s) URL (.m3u8 HLS
 * playlist or a direct video/audio file), it gets probed in the main process
 * and handed to the video player. Recent URLs persist locally.
 */
export function NetworkStreamDialog({
  open,
  onOpenChange,
  onPlay,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPlay: (url: string, probe: NetworkStreamProbeDto) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const [url, setUrl] = useState('');
  const [probing, setProbing] = useState(false);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem('rekordly:netStreams');
      const parsed: unknown = JSON.parse(raw ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string').slice(0, 8) : [];
    } catch {
      return [];
    }
  });

  const remember = (u: string): void => {
    setHistory((prev) => {
      const next = [u, ...prev.filter((x) => x !== u)].slice(0, 8);
      try {
        window.localStorage.setItem('rekordly:netStreams', JSON.stringify(next));
      } catch {
        /* storage unavailable — history is session-only */
      }
      return next;
    });
  };

  const start = async (): Promise<void> => {
    const trimmed = url.trim();
    if (trimmed === '') return;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      pushToast({ level: 'warn', title: 'Invalid URL', message: 'Enter a full http(s) stream URL.' });
      return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      pushToast({ level: 'warn', title: 'Unsupported protocol', message: 'Only http/https URLs can be played.' });
      return;
    }
    setProbing(true);
    try {
      const probe = await window.desktop.app.probeNetworkStream({ url: parsed.toString() });
      remember(parsed.toString());
      onOpenChange(false);
      setUrl('');
      onPlay(parsed.toString(), probe);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast({ level: 'error', title: 'Stream unavailable', message: msg.slice(0, 200) });
    } finally {
      setProbing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Open Network Stream"
        description="Play an HLS (.m3u8) or direct video URL — like VLC's Network Stream."
        className="max-w-lg"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !probing) void start();
                }}
                placeholder="https://example.com/stream.m3u8"
                className="pl-8"
                aria-label="Network stream URL"
              />
            </div>
            <Button onClick={() => void start()} loading={probing}>
              <Play size={14} /> Play
            </Button>
          </div>

          <p className="text-[11px] text-foreground-muted">
            Supported: HLS playlists (.m3u8 / .m3u, live or VOD) and direct media files (mp4, webm, mkv, mp3…).
          </p>

          {history.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-foreground-muted">
                <History size={12} /> Recent streams
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {history.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setUrl(h);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm border border-border bg-elevated px-2.5 py-1.5 text-left text-xs text-foreground hover:border-primary/50"
                    title={h}
                  >
                    <Radio size={12} className="shrink-0 text-foreground-muted" />
                    <span className="truncate">{h}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
