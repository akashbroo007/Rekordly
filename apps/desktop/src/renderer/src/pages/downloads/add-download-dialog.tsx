/**
 * AddDownloadDialog — the fine-grained "Add Download" flow:
 *   link (probed on open when handed over from the paste bar) ·
 *   quality/format picker (only qualities the link actually offers) ·
 *   "Audio only (MP3)" · priority Low/Normal/High · destination subfolder
 *   + resolved preview. The user CHECKS first, picks everything, and only
 *   the final "Add Download" queues it.
 *
 * Option support mirrors the backend EXACTLY (nothing re-invented):
 *   •  `downloads.add` accepts url/destination/fileName/title/priority/
 *      audioOnly/quality — so the dialog offers those and nothing else.
 *   •  A per-download SPEED LIMIT is NOT supported (the engine reads the
 *      global Settings → Downloads bandwidth cap only) → the control is
 *      hidden, not shown disabled.
 *   •  Quality + Audio-only are yt-dlp (site) options; direct files probe a
 *      single "Original file" format → both controls hide for http links.
 *   •  Priority sorts in scheduler order (lowest number first):
 *      High = -1 · Normal = 0 · Low = 1 (a pre-existing data shape — the
 *      old default 0 stays the default).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Dialog, DialogContent, Input, Select, Switch } from '@rekordly/ui';
import type { DownloadProbeResultDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../../stores/toast-store';
import { maskHomeDir } from '../uploads/upload-errors';

type PriorityValue = 'high' | 'normal' | 'low';

const PRIORITY_VALUE: Record<PriorityValue, number> = { high: -1, normal: 0, low: 1 };

/** Mirrors DownloadManager.deriveSiteFolder — preview only, the main process decides. */
function previewSiteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const parts = host.split('.').filter((p) => p.length > 0);
    const name = parts.length >= 2 ? parts[parts.length - 2]! : (parts[0] ?? '');
    const safe = name.replace(/[^a-z0-9_-]/g, '').slice(0, 64);
    return safe.length > 0 ? safe : 'misc';
  } catch {
    return 'misc';
  }
}

export function AddDownloadDialog({
  open,
  onOpenChange,
  initialUrl = '',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Link handed over from the paste bar → seeded into the field and probed right away. */
  initialUrl?: string;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [subfolder, setSubfolder] = useState('');
  const [audioOnly, setAudioOnly] = useState(false);
  const [priority, setPriority] = useState<PriorityValue>('normal');
  const [probe, setProbe] = useState<DownloadProbeResultDto | null>(null);
  const [quality, setQuality] = useState('best');

  // Show where the file will land so the user never has to pick a folder
  // manually — the main process derives <downloadsDir>/<website>/ (masked
  // so the account name never reaches the screen).
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
    enabled: open,
  });
  const saveLocation =
    settings !== undefined && url.trim().length > 0
      ? maskHomeDir(`${settings.downloadsDir}\\${subfolder.trim() || previewSiteFolder(url.trim())}`)
      : null;

  const isSiteLink = probe === null ? true : probe.engine === 'ytdlp';

  const resetProbe = (): void => {
    setProbe(null);
    setQuality('best');
  };

  const checkQualities = useMutation({
    mutationFn: (link: string) => window.desktop.downloads.probe(link),
    onSuccess: (result) => {
      setProbe(result);
      setQuality(result.formats[0]?.value ?? 'best');
    },
  });

  // Opened from the paste bar with a link → fill the field and probe
  // immediately: check FIRST, then the user picks every option, and only
  // the final "Add Download" queues it. Typed edits go through the manual
  // Check button instead (no auto-probe on every keystroke).
  const seededUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      seededUrlRef.current = null;
      return;
    }
    const seed = initialUrl.trim();
    if (seed === '' || seededUrlRef.current === seed) return;
    seededUrlRef.current = seed;
    setUrl(seed);
    resetProbe();
    checkQualities.mutate(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUrl]);

  // Per-download speed limit intentionally ABSENT — the download engine
  // only supports the global Settings → Downloads bandwidth cap.
  const addDownload = useMutation({
    mutationFn: () =>
      window.desktop.downloads.add({
        url,
        // empty = auto-organize into <downloadsDir>/<website>/; a custom
        // subfolder resolves relative to the download directory.
        destination: subfolder.trim(),
        fileName: fileName || 'download',
        audioOnly,
        quality,
        priority: PRIORITY_VALUE[priority],
        title: probe?.title,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
      void queryClient.invalidateQueries({ queryKey: ['downloads-count'] });
      pushToast({
        level: 'info',
        title: 'Download added',
        message: `${fileName || 'Download'} queued${priority !== 'normal' ? ` with ${priority} priority` : ''}.`,
      });
      onOpenChange(false);
      setUrl(''); setFileName(''); setSubfolder(''); setAudioOnly(false); setPriority('normal'); resetProbe();
    },
  });

  const canCheck = url.trim().length > 0 && !checkQualities.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add Download" description="Check the link, pick your options, then queue the download.">
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label="Link"
                value={url}
                onChange={(e) => { setUrl(e.target.value); resetProbe(); }}
                placeholder="Video/audio page or direct file URL (YouTube, Vimeo, SoundCloud, .mp4/.mp3 links...)"
              />
            </div>
            <Button variant="secondary" loading={checkQualities.isPending} disabled={!canCheck} onClick={() => checkQualities.mutate(url.trim())}>
              Check
            </Button>
          </div>

          {checkQualities.isError && (
            <p className="text-sm text-error">
              {checkQualities.error instanceof Error ? checkQualities.error.message : 'Could not inspect this link.'}
            </p>
          )}

          {checkQualities.isPending && (
            <p className="text-sm text-foreground-muted" role="status">
              Checking the link…
            </p>
          )}

          {probe !== null && (
            <div className="rounded-sm border border-border bg-surface px-3 py-2.5">
              <Badge variant="muted" className="mb-1">{probe.engine === 'http' ? 'Direct file' : 'Site extraction'}</Badge>
              {probe.title !== undefined && (
                <p className="truncate text-sm font-medium text-foreground">{probe.title}</p>
              )}
              <p className="mt-0.5 text-sm text-foreground-muted">
                {probe.formats.length} format option{probe.formats.length === 1 ? '' : 's'} available
              </p>
            </div>
          )}

          {probe !== null && isSiteLink && !audioOnly && (
            <Select
              label="Quality"
              hint="Only the qualities this link actually offers are listed."
              options={probe.formats.map((f) => ({ value: f.value, label: f.label }))}
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
            />
          )}

          {probe !== null && isSiteLink && (
            <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">Audio only (MP3)</p>
                <p className="text-sm text-foreground-muted">Extract just the audio track and convert it to MP3.</p>
              </div>
              <Switch checked={audioOnly} onCheckedChange={setAudioOnly} aria-label="Audio only (MP3)" />
            </div>
          )}

          {/* Priority — segmented Low / Normal / High (scheduler order). */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground-secondary">Priority</span>
            <div
              role="radiogroup"
              aria-label="Download priority"
              className="flex w-fit rounded-md border border-border bg-surface p-0.5"
            >
              {(['low', 'normal', 'high'] as PriorityValue[]).map((value) => {
                const selected = priority === value;
                const titles: Record<PriorityValue, string> = {
                  low: 'Queues after normal downloads',
                  normal: 'The default queue position',
                  high: 'Runs before normal downloads',
                };
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={titles[value]}
                    onClick={() => setPriority(value)}
                    className={`w-20 cursor-pointer rounded-sm px-2 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      selected ? 'bg-primary text-white' : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="File name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="Optional file name (without extension)"
          />
          <Input
            label="Destination folder (optional)"
            value={subfolder}
            onChange={(e) => setSubfolder(e.target.value)}
            placeholder="Custom subfolder inside the download directory"
            hint={url.trim().length > 0 ? 'Empty = automatically organized as <download folder>/<website>/' : 'Empty = automatically organized per website'}
          />
          {saveLocation !== null && (
            <p className="text-sm text-foreground-muted">
              Saves to: <span className="text-foreground-secondary">{saveLocation}</span> · change the root in Settings → Downloads
            </p>
          )}

          <Button
            loading={addDownload.isPending}
            disabled={!url.trim() || checkQualities.isPending}
            onClick={() => addDownload.mutate()}
            className="w-full"
            title={checkQualities.isPending ? 'Wait for the link check to finish' : 'Queue the download with the options above'}
          >
            Add Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
