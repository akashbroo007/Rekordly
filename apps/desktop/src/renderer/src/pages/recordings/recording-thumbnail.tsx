/**
 * 16:9 recording thumbnails (~96x54).
 *
 * Resolution order:
 *   1. ffmpeg-generated thumbnail file already on disk (thumbnailPath —
 *      enriched by the recording engine for completed files) → sf-media URL.
 *   2. The site's live preview image (job.thumbnail, remote URL).
 *   3. ONE frame extracted in the MAIN PROCESS via ffmpeg (~10% into the
 *      video; duration probed with ffprobe first) — never in the renderer,
 *      so the UI can never be blocked. Results are cached per file and the
 *      queue is gated by an IntersectionObserver + max 2 running extractions.
 *   4. Fallback: creator avatar on a platform-tinted gradient (initials when
 *      no avatar). Failed/cancelled tiles render dimmed.
 */
import { useEffect, useRef, useState } from 'react';
import { toMediaUrl } from '../../components/video-player-dialog';
import { platformColor } from '../../components/platform-config';
import { PRIVACY_MEDIA_BLUR_CLASS } from '../../components/privacy-mode';

export interface ThumbMeta {
  /** sf-media / data / remote image URL, when one resolved. */
  src?: string;
  /** ffprobe facts (displayed in the row's meta line when known). */
  resolution?: string;
  durationSeconds?: number;
}

type CacheEntry =
  | { state: 'done'; meta: ThumbMeta | null }
  | { state: 'loading'; promise: Promise<ThumbMeta> };

const METADATA_CACHE = new Map<string, CacheEntry>();
const MAX_CONCURRENT = 2;
let activeCount = 0;
const waiters: Array<() => void> = [];

function schedule(task: () => Promise<void>): void {
  const run = (): void => {
    activeCount += 1;
    void task().finally(() => {
      activeCount -= 1;
      const next = waiters.shift();
      if (next !== undefined) next();
    });
  };
  if (activeCount < MAX_CONCURRENT) run();
  else waiters.push(run);
}

/**
 * Background ffmpeg pipeline for one file: probe duration → grab a frame at
 * ~10% in → return the frame (and any probed metadata). Falls back to a
 * fixed small offset when the file is truncated and probing fails.
 */
async function generateForFile(filePath: string): Promise<ThumbMeta> {
  let resolution: string | undefined;
  let durationSeconds: number | undefined;
  let seconds = 5;
  try {
    const info = await window.desktop.app.getMediaInfo({ filePath });
    if (Number.isFinite(info.duration) && info.duration > 0) {
      durationSeconds = info.duration;
      seconds = Math.min(Math.max(info.duration * 0.1, 1), Math.max(info.duration - 0.5, 1));
    }
    if (info.resolution !== '') resolution = info.resolution;
  } catch {
    /* ffprobe can fail on truncated partial files — try the frame anyway */
  }
  try {
    const { dataUrl } = await window.desktop.app.extractFrame({ filePath, seconds });
    return { src: dataUrl, resolution, durationSeconds };
  } catch {
    return { resolution, durationSeconds };
  }
}

export function thumbForFile(filePath: string): Promise<ThumbMeta> {
  const cached = METADATA_CACHE.get(filePath);
  if (cached !== undefined) {
    return cached.state === 'done' ? Promise.resolve(cached.meta ?? {}) : cached.promise;
  }
  const promise = new Promise<ThumbMeta>((resolve) => {
    schedule(() =>
      generateForFile(filePath).then((meta) => {
        METADATA_CACHE.set(filePath, { state: 'done', meta: meta.src === undefined ? null : meta });
        resolve(meta);
      }),
    );
  });
  METADATA_CACHE.set(filePath, { state: 'loading', promise });
  return promise;
}

/** Simple in-view gate: off-screen rows must not spend ffmpeg slots. */
function useInView(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setInView(true);
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
}

// --- isolated initials fallback (same palette math as CreatorCard) ------------

const AVATAR_PALETTES: Array<readonly [string, string]> = [
  ['#312e81', '#4338ca'],
  ['#064e3b', '#0f766e'],
  ['#3b0764', '#6d28d9'],
  ['#7f1d1d', '#b91c1c'],
  ['#78350f', '#b45309'],
  ['#0e7490', '#0891b2'],
  ['#334155', '#475569'],
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function initialsFor(displayName: string): string {
  const words = displayName.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '?';
  const second = words[1];
  if (second === undefined) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export interface RecordingThumbProps {
  /** Job row (thumbnailPath / thumbnail / filePath sources). */
  job: {
    thumbnailPath?: string | null;
    thumbnail?: string | null;
    filePath?: string | null;
    pluginId: string;
  };
  /** Creator display name for the initials fallback. */
  creatorName: string;
  /** Creator avatar for the fallback tile. */
  avatarUrl?: string | null;
  /** Dimmed for failed/cancelled rows. */
  dimmed?: boolean;
  /** Wider variant for active cards. */
  large?: boolean;
  /**
   * Explicit fallback-gradient tint override (e.g. the Uploads page passes
   * the provider's brand color instead of the platform tint). When omitted
   * the platform color for `job.pluginId` is used, unchanged.
   */
  tint?: string;
  /**
   * Privacy mode: blur the image/fallback content while keeping the crisp
   * 16:9 tile — safe for screen shares. Optional and off by default; pages
   * with a Privacy-mode toggle pass it per page (one global toggle).
   */
  blurred?: boolean;
  /** Notified with any extra metadata discovered while generating. */
  onMeta?: (meta: { resolution?: string; durationSeconds?: number }) => void;
}


export function RecordingThumb({
  job,
  creatorName,
  avatarUrl,
  dimmed = false,
  large = false,
  tint: tintOverride,
  blurred = false,
  onMeta,
}: RecordingThumbProps) {
  // Track the current image source + retry chains: disk thumb → site
  // preview → ffmpeg frame → gradient fallback.
  const [gateRef, inView] = useInView();
  const diskSrc = job.thumbnailPath !== null && job.thumbnailPath !== undefined && job.thumbnailPath !== ''
    ? toMediaUrl(job.thumbnailPath)
    : null;
  const [generatedSrc, setGeneratedSrc] = useState<string | null>(null);
  const [diskBroken, setDiskBroken] = useState(false);
  const [siteBroken, setSiteBroken] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const canGenerate =
    diskSrc === null &&
    (job.thumbnail === null || job.thumbnail === undefined || job.thumbnail === '') &&
    job.filePath !== null && job.filePath !== undefined && job.filePath !== '';

  useEffect(() => {
    if (!inView || !canGenerate || generatedSrc !== null) return;
    let alive = true;
    void thumbForFile(job.filePath!)
      .then((result) => {
        if (!alive) return;
        if (result.src !== undefined) setGeneratedSrc(result.src);
        onMeta?.({ resolution: result.resolution, durationSeconds: result.durationSeconds });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // job.filePath identity fully determines generation.
  }, [inView, canGenerate, generatedSrc, job.filePath, onMeta]);

  // ponytail: platform tint drives the fallback gradient so every row of a
  // platform shares the same hue family. The Uploads page overrides it with
  // the provider's brand tint via the optional `tint` prop.
  const tint = tintOverride ?? platformColor(job.pluginId);
  const gradient = `linear-gradient(135deg, color-mix(in srgb, ${tint} 22%, #101014), color-mix(in srgb, ${tint} 10%, #17171c))`;
  const palette = AVATAR_PALETTES[hashString(creatorName.toLowerCase()) % AVATAR_PALETTES.length] ?? AVATAR_PALETTES[0]!;

  const src =
    diskSrc !== null && !diskBroken
      ? diskSrc
      : generatedSrc !== null
        ? generatedSrc
        : job.thumbnail !== null && job.thumbnail !== undefined && job.thumbnail !== '' && !siteBroken
          ? job.thumbnail
          : null;
  const hasImage = src !== null;

  // Privacy mode: blur the CONTENT (img / avatar / initials) while the tile
  // keeps its crisp border; scale hides the blur's soft edges inside the tile.
  const opaqueContentClass = blurred ? PRIVACY_MEDIA_BLUR_CLASS : '';

  return (
    <div
      ref={gateRef}
      aria-hidden="true"
      className={`relative shrink-0 overflow-hidden rounded-sm border border-border ${dimmed ? 'saturate-50 opacity-70' : ''} ${
        large ? 'h-[72px] w-[128px]' : 'h-[54px] w-[96px]'
      }`}
      style={{ backgroundColor: '#101014' }}
    >
      {hasImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => {
            if (diskSrc !== null && src === diskSrc) setDiskBroken(true);
            else if (generatedSrc !== null && src === generatedSrc) setGeneratedSrc(null);
            else if (src === job.thumbnail) setSiteBroken(true);
          }}
          className={`h-full w-full object-cover ${opaqueContentClass}`}
        />
      ) : avatarUrl !== null && avatarUrl !== undefined && avatarUrl !== '' && !avatarBroken ? (
        <div className={`flex h-full w-full items-center justify-center ${opaqueContentClass}`} style={{ backgroundImage: gradient }}>
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            onError={() => setAvatarBroken(true)}
            className="h-7 w-7 rounded-full object-cover"
          />
        </div>
      ) : (
        // ponytail: no image at all — platform-tinted gradient + initials,
        // same palette math as the creators page avatar fallback.
        <div
          className={`flex h-full w-full items-center justify-center ${opaqueContentClass}`}
          style={{ backgroundImage: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}
        >
          <span className="text-xs font-semibold text-white/80">{initialsFor(creatorName)}</span>
        </div>
      )}
    </div>
  );
}
