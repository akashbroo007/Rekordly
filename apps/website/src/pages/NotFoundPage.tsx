import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useSeo } from "../lib/seo";

/* ------------------------------------------------------------------ */
/*  Interactive dot matrix (Factory-style).                            */
/*                                                                     */
/*  Idle:  a calm gray dot field — with the "404" faintly legible      */
/*         inside it (digit dots sit slightly brighter than the rest). */
/*  Hover: the ENTIRE 404 ignites at once in mottled orange — each     */
/*         digit dot has its own target brightness, so the reveal      */
/*         looks organic rather than uniform. Leaves → fades back.     */
/* ------------------------------------------------------------------ */

/** 5×7 glyph bitmaps — 1 = dot belongs to the digit. */
const GLYPHS: Record<string, readonly (readonly number[])[]> = {
  "4": [
    [0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 1, 0],
  ],
  "0": [
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 1, 1, 0],
  ],
};

const DIGITS = ["4", "0", "4"] as const;
const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPH_GAP = 2;

/** Full interactive grid — 24×11 like the reference. */
const COLS = 24;
const ROWS = 11;
const BITMAP_W = DIGITS.length * GLYPH_W + (DIGITS.length - 1) * GLYPH_GAP; // 19
const OFFSET_X = Math.floor((COLS - BITMAP_W) / 2);
const OFFSET_Y = Math.floor((ROWS - GLYPH_H) / 2);

/** Idle brightness boost for digit dots (how visibly 404 shows at rest). */
const IDLE_DIGIT_BOOST = 1.9;
/** Hover reveal animation speed (per-frame lerp factor). */
const REVEAL_RISE = 0.06;
const REVEAL_FALL = 0.03;

interface DotSpec {
  digit: boolean;
  /** Idle alpha of a background dot. */
  base: number;
  /** Idle alpha of a digit dot (base * IDLE_DIGIT_BOOST, capped). */
  idleAlpha: number;
  /** Max orange alpha when revealed — randomized per dot → mottled look. */
  heat: number;
  /** Orange shade: bright cores, rust mids, muted embers (cluster look). */
  tint: readonly [number, number, number];
  /** How fast this dot transitions when the reveal changes. */
  react: number;
  /** Render as a small hollow circle instead of a filled dot. */
  hollow: boolean;
  phase: number;
  speed: number;
}

function isDigitCell(x: number, y: number): boolean {
  const lx = x - OFFSET_X;
  const ly = y - OFFSET_Y;
  if (lx < 0 || ly < 0 || ly >= GLYPH_H || lx >= BITMAP_W) return false;
  const gi = Math.floor(lx / (GLYPH_W + GLYPH_GAP));
  const inner = lx % (GLYPH_W + GLYPH_GAP);
  if (inner >= GLYPH_W) return false;
  const glyph = GLYPHS[DIGITS[gi] ?? "4"];
  if (!glyph) return false;
  return glyph[ly]?.[inner] === 1;
}

function buildDots(): DotSpec[] {
  const dots: DotSpec[] = [];
  // Orange cluster palette: bright cores → rust mids → muted embers.
  const BRIGHT: readonly [number, number, number] = [255, 98, 0];
  const RUST: readonly [number, number, number] = [214, 96, 32];
  const MUTED: readonly [number, number, number] = [172, 96, 58];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const digit = isDigitCell(x, y);
      const base = 0.1 + Math.random() * 0.26;
      // Wave/cluster heat: a bright core, a rust mid band, muted edges —
      // the uneven organic ignition of the reference.
      const roll = Math.random();
      const heat =
        roll < 0.2
          ? 0.9 + Math.random() * 0.1 // bright core
          : roll < 0.62
            ? 0.5 + Math.random() * 0.32 // rust mid
            : 0.16 + Math.random() * 0.3; // muted ember
      const tint = heat > 0.82 ? BRIGHT : heat > 0.45 ? RUST : MUTED;
      dots.push({
        digit,
        base,
        idleAlpha: digit ? Math.min(0.6, base * IDLE_DIGIT_BOOST + 0.08) : base,
        heat,
        tint,
        react: 0.5 + Math.random() * 0.5,
        // Hollow circles appear only on background dots, denser near the
        // digits (the "gap" regions around the 404).
        hollow:
          !digit &&
          (Math.random() < 0.16 ||
            (Math.abs(y - OFFSET_Y - GLYPH_H / 2) < 5 && Math.random() < 0.1)),
        phase: Math.random(),
        speed: 0.4 + Math.random() * 1.1,
      });
    }
  }
  return dots;
}

/**
 * "Broken link" indicators — thin gray connectors with small solid
 * endpoint dots, like disconnected pathways in the reference. Includes
 * straight, diagonal, and cross (+) shapes, placed asymmetrically.
 */
interface ConnectorSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function buildConnectors(): ConnectorSegment[] {
  const segments: ConnectorSegment[] = [];
  const directions: readonly (readonly [number, number])[] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  const pushSegment = (ax: number, ay: number, dx: number, dy: number, len: number): void => {
    segments.push({ ax, ay, bx: ax + dx * (len - 1), by: ay + dy * (len - 1) });
  };

  // 3–4 straight/diagonal broken links.
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = directions[Math.floor(Math.random() * directions.length)] ?? [1, 0];
    const len = Math.random() < 0.5 ? 2 : 3;
    const minX = Math.max(0, -dx * (len - 1));
    const maxX = Math.min(COLS - 1 - dx * (len - 1), COLS - 1);
    const minY = Math.max(0, -dy * (len - 1));
    const maxY = Math.min(ROWS - 1 - dy * (len - 1), ROWS - 1);
    if (minX > maxX || minY > maxY) continue;
    pushSegment(
      minX + Math.floor(Math.random() * (maxX - minX + 1)),
      minY + Math.floor(Math.random() * (maxY - minY + 1)),
      dx,
      dy,
      len,
    );
  }

  // 2 crosses (+): a vertical and a horizontal arm sharing a center.
  for (let i = 0; i < 2; i++) {
    const cxp = 4 + Math.floor(Math.random() * (COLS - 8));
    const cyp = 3 + Math.floor(Math.random() * (ROWS - 6));
    const arm = Math.random() < 0.5 ? 1 : 2;
    pushSegment(cxp - arm, cyp, 1, 0, arm * 2 + 1); // horizontal through center
    pushSegment(cxp, cyp - arm, 0, 1, arm * 2 + 1); // vertical through center
  }

  return segments;
}

function DotMatrix404() {
  const dots = useMemo(buildDots, []);
  const connectors = useMemo(buildConnectors, []);
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Per-dot current orange level (0..1) — each dot chases `reveal * heat`.
    const level: number[] = new Array<number>(COLS * ROWS).fill(0);

    // Global reveal progress 0..1: rises while the pointer is anywhere over
    // the grid, falls when it leaves. Drives the whole 404 at once.
    let reveal = 0;
    let inside = false;

    const onPointerEnter = (): void => {
      inside = true;
    };
    const onPointerLeave = (): void => {
      inside = false;
    };

    canvas.addEventListener("pointerenter", onPointerEnter);
    canvas.addEventListener("pointermove", onPointerEnter);
    canvas.addEventListener("pointerleave", onPointerLeave);

    let raf = 0;
    let running = true;
    const start = performance.now();

    const draw = (now: number): void => {
      if (!running) return;
      const t = (now - start) / 1000;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cell = Math.min(w / COLS, h / ROWS);
      const dotR = Math.max(1.6, cell * 0.26);
      const cx = (w - cell * COLS) / 2;
      const cy = (h - cell * ROWS) / 2;

      // Global reveal — smooth rise/fall, no per-dot target needed.
      const target = inside ? 1 : 0;
      const k = target > reveal ? REVEAL_RISE : REVEAL_FALL;
      reveal += (target - reveal) * k;
      if (Math.abs(target - reveal) < 0.001) reveal = target;

      // --- draw dots ----------------------------------------------
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const i = y * COLS + x;
          const dot = dots[i];
          if (!dot) continue;
          const px = cx + x * cell + cell / 2;
          const py = cy + y * cell + cell / 2;

          // Gentle ambient shimmer (disabled for reduced motion).
          const idle =
            reduceMotion === true
              ? 1
              : 0.85 + 0.15 * Math.sin(t * dot.speed * 1.6 + dot.phase * Math.PI * 2);

          if (dot.digit) {
            // Each digit dot chases its own mottled target brightness.
            const targetLevel = reveal * dot.heat;
            const cur = level[i] ?? 0;
            const kk = targetLevel > cur ? 0.12 * dot.react : 0.03;
            level[i] = cur + (targetLevel - cur) * kk;
            const lv = level[i] ?? 0;

            if (lv > 0.01) {
              // Ignited: orange layered over the gray base, per-dot tint.
              const [r, g, b] = dot.tint;
              const gray = dot.idleAlpha * idle * (1 - lv);
              ctx.beginPath();
              ctx.fillStyle = `rgba(255, 255, 255, ${gray.toFixed(3)})`;
              ctx.arc(px, py, dotR, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${lv.toFixed(3)})`;
              ctx.arc(px, py, dotR, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Idle: digit dot sits brighter gray — 404 subtly legible.
              ctx.beginPath();
              ctx.fillStyle = `rgba(255, 255, 255, ${(dot.idleAlpha * idle).toFixed(3)})`;
              ctx.arc(px, py, dotR, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            // Background dot — dim gray flicker, occasionally hollow.
            const alpha = dot.base * idle;
            const r = dot.hollow ? dotR * 0.45 : dotR;
            ctx.beginPath();
            if (dot.hollow) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 1.4).toFixed(3)})`;
              ctx.lineWidth = 1;
              ctx.arc(px, py, r, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
              ctx.arc(px, py, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // --- annotation connectors ----------------------------------
      if (reveal > 0.35) {
        for (const seg of connectors) {
          const x1 = cx + seg.ax * cell + cell / 2;
          const y1 = cy + seg.ay * cell + cell / 2;
          const x2 = cx + seg.bx * cell + cell / 2;
          const y2 = cy + seg.by * cell + cell / 2;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.3 * reveal).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          for (const [px, py] of [
            [x1, y1],
            [x2, y2],
          ] as const) {
            ctx.beginPath();
            ctx.fillStyle = `rgba(140, 140, 140, ${(0.75 * reveal).toFixed(3)})`;
            ctx.arc(px, py, dotR * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerenter", onPointerEnter);
      canvas.removeEventListener("pointermove", onPointerEnter);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [dots, connectors, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="h-auto w-full max-w-[660px] cursor-default"
      style={{ aspectRatio: `${COLS} / ${ROWS}` }}
      aria-label="Interactive dot grid — hover to reveal 404"
      role="img"
    />
  );
}

/** Small inline arrow that nudges right on hover. */
function ArrowRightIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 8h11M9 3.5 13.5 8 9 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function NotFoundPage() {
  useSeo({
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
    path: "/404",
    noindex: true,
  });

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-black px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl flex-1 pt-10">
        {/* Eyebrow: pulsing orange dot + ERROR */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2.5"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5900] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5900]" />
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Error
          </span>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
          {/* Left: headline + CTA */}
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="max-w-xl text-4xl font-medium leading-[1.05] tracking-[-0.045em] text-white sm:text-5xl lg:text-[4rem]"
            >
              These are not the droids you are looking for&hellip;
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-10"
            >
              <Link
                to="/"
                className="group inline-flex items-center gap-2 border border-white/30 bg-white px-5 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-white/90"
              >
                Back to home
                <ArrowRightIcon />
              </Link>
            </motion.div>
          </div>

          {/* Right: interactive dot-matrix (desktop) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="hidden lg:ml-auto lg:block"
          >
            <DotMatrix404 />
          </motion.div>
        </div>

        {/* Mobile / narrow: matrix below the CTA */}
        <div className="mt-12 lg:hidden">
          <DotMatrix404 />
        </div>
      </div>
    </div>
  );
}
