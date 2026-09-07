import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@rekordly/ui';

export interface SpotlightStep {
  /** Value of the data-tour-id attribute to spotlight. */
  tourId: string;
  /** Route to navigate to when this step becomes active. */
  path?: string;
  emoji: string;
  title: string;
  description: string;
  /** Short actionable hint shown as a "try it" chip. */
  tip?: string;
}

interface SpotlightTourProps {
  steps: readonly SpotlightStep[];
  onFinish: () => void;
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

/**
 * First-launch spotlight tour: dims the whole app except a rounded cutout
 * around each step's [data-tour-id] element, with an explanatory tooltip
 * card next to it. Each step auto-navigates to its page so the user sees
 * the real screen while learning it. Esc skips, arrow keys navigate.
 */
export function SpotlightTour({ steps, onFinish, onSkip }: SpotlightTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const navigate = useNavigate();
  const step = steps[index];

  // ponytail: drive the tour by actually visiting each page — the user
  // learns where things live by seeing them, not just reading about them.
  useEffect(() => {
    if (step?.path !== undefined) navigate(step.path);
  }, [step, navigate]);

  const measure = useCallback(() => {
    if (step === undefined) return;
    // Wait a frame so the freshly-navigated page has painted.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.tourId}"]`);
      if (el === null) {
        setRect(null);
        return;
      }
      const box = el.getBoundingClientRect();
      setRect({
        top: box.top - PADDING,
        left: box.left - PADDING,
        width: box.width + PADDING * 2,
        height: box.height + PADDING * 2,
      });
    });
  }, [step]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const advance = useCallback((): void => {
    if (index >= steps.length - 1) onFinish();
    else setIndex(index + 1);
  }, [index, steps.length, onFinish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onSkip();
      else if (event.key === 'ArrowRight' || event.key === 'Enter') advance();
      else if (event.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [index, advance, onSkip]);

  if (step === undefined) return null;

  // Tooltip placement: sidebar targets get the card to their right,
  // vertically centered; falls back below when there is no room.
  let tooltipStyle: React.CSSProperties = {};
  if (rect !== null) {
    const tooltipWidth = 320;
    const spaceRight = window.innerWidth - (rect.left + rect.width);
    if (spaceRight > tooltipWidth + 32) {
      tooltipStyle = {
        left: rect.left + rect.width + 20,
        top: Math.max(16, rect.top + rect.height / 2 - 80),
        width: tooltipWidth,
      };
    } else {
      tooltipStyle = {
        left: Math.min(rect.left, window.innerWidth - tooltipWidth - 16),
        top: rect.top + rect.height + 12,
        width: tooltipWidth,
      };
    }
  }

  const isLast = index >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="Guided tour">
      {/* Cutout: transparent hole over the target, huge shadow dims the rest */}
      {rect !== null && (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
          }}
        >
          {/* ponytail: pulsing ring draws the eye to the active target. */}
          <div className="absolute -inset-1 animate-ping rounded-lg border-2 border-primary/50" />
        </div>
      )}

      {/* Tooltip card */}
      <div
        className="absolute rounded-lg border border-border bg-panel p-4 shadow-xl transition-all duration-300"
        style={tooltipStyle}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {step.emoji} Step {index + 1} of {steps.length}
          </p>
          {/* Progress dots — quick glance at how far along you are */}
          <div className="flex items-center gap-1" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.tourId}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-4 bg-primary' : i < index ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </div>
        </div>
        <h3 className="mt-2 text-base font-semibold text-foreground">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">{step.description}</p>
        {step.tip !== undefined && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            💡 {step.tip}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            <span className="mr-1 hidden text-[10px] text-foreground-muted sm:inline">
              use ← → keys
            </span>
            {index > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={advance}>
              {isLast ? "Let's go! 🚀" : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}