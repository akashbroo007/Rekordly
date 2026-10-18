import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { FEATURES_HUB_PATH, navFeaturePages } from "../../content/featuresConfig";

const menuItemClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive
      ? "bg-white/10 font-medium text-white"
      : "text-white/80 hover:bg-white/5 hover:text-white"
  }`;

/** Row of links inside the panel / accordion, from the features config. */
function FeatureMenuItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {navFeaturePages.map((page) => (
        <li key={page.path}>
          <NavLink
            to={page.path}
            className={menuItemClass}
            onClick={onNavigate}
          >
            <span>{page.name}</span>
            {page.popular && (
              <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Popular
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </>
  );
}

/**
 * Desktop "Features" dropdown for the navbar pill: the WHOLE button is the
 * dropdown trigger (label + chevron in one pill, styled exactly like the
 * other pills). Opens on hover, click, or keyboard focus. Closes on Escape,
 * outside interaction, and navigation. The label is a plain trigger — the
 * hub itself is reachable via "All features" at the bottom of the panel.
 */
export function FeaturesDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const location = useLocation();

  // Close after any navigation (and when moving between routes).
  useEffect(() => {
    setOpen(false);
  }, [location]);

  // Close when a pointer interaction starts outside the dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onBlur={(event) => {
        // Keyboard focus moved outside the dropdown
        if (
          event.relatedTarget instanceof Node &&
          !containerRef.current?.contains(event.relatedTarget)
        ) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="nav-features-menu"
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        onFocus={openNow}
        className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 hover:text-white ${
          open || location.pathname.startsWith(FEATURES_HUB_PATH)
            ? "bg-white/10 text-white"
            : "text-white/90"
        }`}
      >
        Features
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="nav-features-menu"
          className="absolute left-1/2 top-full z-30 mt-3 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <ul className="space-y-0.5">
            <FeatureMenuItems />
          </ul>
          <div className="mt-1 border-t border-white/10 pt-1">
            <Link
              to={FEATURES_HUB_PATH}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              All features
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobile accordion variant used inside the navbar's mobile menu. */
export function FeaturesAccordion() {
  const location = useLocation();
  const [expanded, setExpanded] = useState(
    location.pathname.startsWith(FEATURES_HUB_PATH),
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls="mobile-features-menu"
        className={`flex w-full items-center justify-between rounded-full px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 ${
          expanded ? "bg-white/10 text-white" : "text-white/90"
        }`}
      >
        <span>Features</span>
        <ChevronDown
          className={`h-4 w-4 text-white/60 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div
          id="mobile-features-menu"
          className="pb-2 pl-4"
        >
          <ul>
            <li>
              <NavLink
                to={FEATURES_HUB_PATH}
                className={({ isActive }) =>
                  `block rounded-full px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 ${
                    isActive ? "bg-white/10 text-white" : "text-white/70"
                  }`
                }
              >
                All features
              </NavLink>
            </li>
            <FeatureMenuItems />
          </ul>
        </div>
      )}
    </div>
  );
}
