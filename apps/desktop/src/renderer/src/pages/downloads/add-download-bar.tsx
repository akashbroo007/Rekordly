/**
 * AddDownloadBar — the compact "Paste a link or drop it here" input that
 * sits above the download list. Enter (or the button) hands the link to the
 * full Add Download dialog, which CHECKS (probes) the link first and shows
 * every option — quality, audio-only, priority, destination — BEFORE
 * anything starts downloading. Nothing is queued straight from the bar.
 *
 * Clipboard detection is never silent: when the window gains focus and the
 * OS clipboard holds a link, a small "Paste link from clipboard?" chip
 * appears NEXT TO the input — the user clicks it to paste. Nothing is read
 * into the field without a click, and each link is offered only once.
 */
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ClipboardPaste, Link2, X } from 'lucide-react';
import { Button, Input } from '@rekordly/ui';

export interface AddDownloadBarProps {
  /** Hands the link to the Add Download dialog (check first → pick options). */
  onSubmit: (url: string) => void;
}

/** http(s)/ftp-ish links only — file:// and program paths are no downloads. */
export function looksLikeLink(text: string): boolean {
  const trimmed = (text.trim().split(/\s+/)[0] ?? '').trim();
  if (trimmed === '' || trimmed.startsWith('file:')) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ftp:';
  } catch {
    return false;
  }
}

export function AddDownloadBar({ onSubmit }: AddDownloadBarProps) {
  const [url, setUrl] = useState('');
  /** Clipboard link on offer — never auto-pasted, shown as an opt-in chip. */
  const [clipboardOffer, setClipboardOffer] = useState<string | null>(null);
  /** Each link is offered once — refocusing with the same link shows nothing. */
  const offeredRef = useRef<string>('');

  const urlRef = useRef(url);
  urlRef.current = url;

  // Window (re)focus → read the clipboard once and OFFER it as a chip.
  useEffect(() => {
    const onFocus = (): void => {
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (!looksLikeLink(text)) return;
          const link = (text.trim().split(/\s+/)[0] ?? '').trim();
          // Same as before, same as the field, or already offered: no chip.
          if (link === offeredRef.current || link === urlRef.current) return;
          offeredRef.current = link;
          setClipboardOffer(link);
        })
        .catch(() => {
          /* no clipboard permission — no chip, no error */
        });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const submit = (): void => {
    const link = url.trim();
    if (!looksLikeLink(link)) return;
    // Not a queue add — the dialog takes over: probe first, then the user
    // picks quality / audio-only / priority / destination, then "Add
    // Download" queues it.
    onSubmit(link);
    setUrl('');
    setClipboardOffer(null);
  };

  const pasteOffer = (): void => {
    if (clipboardOffer === null) return;
    setUrl(clipboardOffer);
    setClipboardOffer(null);
  };

  // Dropping a link (or selected text containing one) fills the input.
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const text =
      event.dataTransfer.getData('text/uri-list') !== ''
        ? event.dataTransfer.getData('text/uri-list')
        : event.dataTransfer.getData('text/plain');
    const link = text.split(/[\r\n\s]+/).find((line) => looksLikeLink(line)) ?? '';
    if (link !== '') {
      setUrl(link.trim());
      setClipboardOffer(null);
    }
  };

  const canAdd = looksLikeLink(url);

  return (
    <div className="rounded-md border border-border bg-surface p-2">
      <div className="flex items-center gap-2">
        <Link2 size={15} className="ml-1 shrink-0 text-foreground-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Download link"
            placeholder="Paste a link or drop it here — press Enter to check it"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="w-full bg-transparent px-1.5"
          />
        </div>
        {clipboardOffer !== null && (
          <span className="inline-flex max-w-[24rem] shrink-0 items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 py-1 pl-1.5 pr-1 text-sm font-medium text-foreground">
            <ClipboardPaste size={13} aria-hidden="true" className="text-primary" />
            <button
              type="button"
              onClick={pasteOffer}
              className="cursor-pointer truncate outline-none focus-visible:outline-2 focus-visible:outline-primary"
              title={clipboardOffer}
            >
              Paste link from clipboard?
            </button>
            <button
              type="button"
              aria-label="Dismiss clipboard suggestion"
              onClick={() => setClipboardOffer(null)}
              className="cursor-pointer rounded-sm p-0.5 transition-colors hover:bg-primary/20"
            >
              <X size={11} />
            </button>
          </span>
        )}
        <Button
          size="sm"
          disabled={!canAdd}
          onClick={submit}
          title="Check this link, then pick quality, audio-only, priority and destination"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
