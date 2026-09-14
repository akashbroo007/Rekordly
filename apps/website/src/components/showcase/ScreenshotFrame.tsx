import type { ReactNode } from "react";

interface ScreenshotFrameProps {
  /** Path under /public, e.g. "./screenshots/dashboard.webp" */
  src?: string;
  alt?: string;
  caption?: string;
  children?: ReactNode;
  /** Path to a demo video under /public, e.g. "./demo/rekordly-demo.mp4". Takes precedence over `src`. */
  videoSrc?: string;
  /** Poster image shown before the video plays */
  poster?: string;
  /** Intrinsic width/height for aspect-ratio reservation (prevents layout shift). */
  width?: number;
  height?: number;
}

/**
 * Window-style frame for desktop-app screenshots and demo videos. Renders
 * a video player when `videoSrc` is provided, a real screenshot when `src`
 * is provided; otherwise shows a placeholder slot you can swap once
 * captures are dropped into public/screenshots/.
 */
export function ScreenshotFrame({
  src,
  alt = "",
  caption,
  children,
  videoSrc,
  poster,
  width,
  height,
}: ScreenshotFrameProps) {
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/60 backdrop-blur-xl">
        {/* Title bar */}
        <div className="flex h-10 items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57] ring-1 ring-black/30" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E] ring-1 ring-black/30" />
          <span className="h-3 w-3 rounded-full bg-[#28C840] ring-1 ring-black/30" />
          <span className="ml-3 flex items-center gap-2 text-xs text-white/50">
            <img
              src="./icon.png"
              alt=""
              width={14}
              height={14}
              className="h-3.5 w-3.5"
            />
            Rekordly
          </span>
        </div>

        {/* Content — no fixed crop: the full desktop capture stays visible */}
        <div className="w-full bg-[#0a0a0a]">
          {videoSrc ? (
            <video
              src={videoSrc}
              poster={poster ?? src}
              controls
              preload="metadata"
              playsInline
              width={width}
              height={height}
              className="aspect-video w-full bg-black object-contain"
            >
              {alt}
            </video>
          ) : src ? (
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              width={width}
              height={height}
              className="h-auto w-full object-contain"
            />
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center p-10 text-center">
              {children ?? (
                <div className="flex aspect-video items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05),transparent_70%)] p-6 text-center">
                  <p className="max-w-sm text-sm text-white/40">
                    Screenshot slot — drop a capture into{" "}
                    <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white/70">
                      apps/website/public/screenshots/
                    </code>{" "}
                    and pass its path via the{" "}
                    <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white/70">
                      src
                    </code>{" "}
                    prop.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {caption && (
        <figcaption className="mt-4 text-center text-sm text-white/50">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
