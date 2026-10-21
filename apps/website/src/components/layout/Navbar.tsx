import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, Github, Menu, X } from "lucide-react";
import { navLinks, secondaryNavLinks, site } from "../../content/site";
import {
  FeaturesAccordion,
  FeaturesDropdown,
} from "../features/FeaturesDropdown";

/** scrollY beyond which the header collapses to brand + GitHub. */
const COLLAPSE_AT_PX = 88;
/** Distance from the viewport edge for brand/GitHub in the collapsed state
    (matches the container's lg padding, so pages whose content starts at
    that same inset never trigger a needless shift). */
const NAV_EDGE_PX = 32;

/**
 * Transition classes for elements that fade/slide away while scrolled
 * (center pill nav, "Get Started"). Animates only opacity/transform and
 * lets visibility flip at the end of the fade so the elements also
 * leave the tab order and screen-reader tree once hidden.
 */
const fadeAway = (scrolled: boolean) =>
  `transition-[opacity,transform,visibility,background-color] duration-300 ease-in-out motion-reduce:transition-none ${
    scrolled
      ? "pointer-events-none invisible -translate-y-2 opacity-0"
      : "visible translate-y-0 opacity-100"
  }`;

/** Transform/opacity-only glide for the brand and GitHub. */
const glide = "transition-transform duration-300 ease-in-out will-change-transform";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  const navRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const githubRef = useRef<HTMLDivElement>(null);

  // Horizontal distance (px) the brand/GitHub translate to reach the viewport
  // edges in the collapsed state. Measured with offsetLeft/offsetWidth, which
  // are layout-based and unaffected by the transforms we apply.
  const [shift, setShift] = useState({ brand: 0, github: 0 });

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Track scroll state on the real window (Lenis scrolls it natively).
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > COLLAPSE_AT_PX);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const measure = useCallback(() => {
    const brand = brandRef.current;
    const github = githubRef.current;
    const nav = navRef.current;
    if (!brand || !github || !nav) return;
    // Below md the mobile menu button owns the right corner and the brand
    // already hugs the edges, so nothing glides there.
    const mdUp = nav.offsetWidth >= 768;
    setShift({
      brand: mdUp ? Math.max(0, brand.offsetLeft - NAV_EDGE_PX) : 0,
      github: mdUp
        ? Math.max(
            0,
            nav.offsetWidth -
              (github.offsetLeft + github.offsetWidth) -
              NAV_EDGE_PX,
          )
        : 0,
    });
  }, []);

  // Re-measure on viewport changes and after fonts have settled.
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    if (typeof document !== "undefined") {
      void document.fonts?.ready.then(measure);
    }
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // On the landing page the nav floats over the full-screen hero beams
  // (reference behavior); on inner pages a spacer keeps the original flow.
  const overlay = location.pathname === "/";

  return (
    <>
      {/* Fixed so the header persists while scrolling: reading the page
          always keeps the brand and GitHub one click away. */}
      <nav ref={navRef} className="fixed inset-x-0 top-0 z-20 w-full">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {/* 3-column grid keeps the pill nav truly centered regardless of
              brand/CTA widths; columns collapse to flex on small screens. */}
          <div className="flex h-16 items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4">
            {/* Brand (left) — glides to the viewport's left edge once scrolled */}
            <div
              ref={brandRef}
              className={`flex items-center justify-start ${glide}`}
              style={
                scrolled && shift.brand > 0
                  ? { transform: `translateX(-${shift.brand}px)` }
                  : undefined
              }
            >
              <Link to="/" className="flex items-center text-xl font-bold text-white">
                {site.name}
              </Link>
            </div>

            {/* Glassmorphic Navigation Pills (center) — fade out when scrolled */}
            <div
              aria-hidden={scrolled || undefined}
              className={`hidden md:flex items-center space-x-1 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 p-1 ${fadeAway(
                scrolled,
              )}`}
            >
              <FeaturesDropdown />
              {navLinks.map((link) => (
                <NavLink
                  key={link.href}
                  to={link.href}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 hover:text-white ${
                      isActive ? "bg-white/10 text-white" : "text-white/90"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>

            {/* CTA (right) */}
            <div className="flex items-center justify-end space-x-4">
              {/* GitHub — glides to the viewport's right edge once scrolled */}
              <div
                ref={githubRef}
                className={glide}
                style={
                  scrolled && shift.github > 0
                    ? { transform: `translateX(${shift.github}px)` }
                    : undefined
                }
              >
                <a
                  href={site.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative hidden overflow-hidden rounded-full sm:inline-flex h-9 items-center justify-center px-4 py-2 text-sm font-medium text-white/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 hover:text-white hover:bg-white/10"
                >
                  <span className="relative z-10 flex items-center">
                    <Github className="mr-2 h-4 w-4" />
                    GitHub
                  </span>
                  <div className="absolute inset-0 -top-2 -bottom-2 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full" />
                </a>
              </div>
              {/* Get Started — fades out together with the pill nav */}
              <Link
                to="/download"
                aria-hidden={scrolled || undefined}
                className={`group relative inline-flex overflow-hidden rounded-full items-center justify-center h-9 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 bg-white text-black hover:bg-gray-100 ${fadeAway(
                  scrolled,
                )}`}
              >
                <span className="relative z-10 flex items-center">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </span>
                <div className="absolute inset-0 -top-2 -bottom-2 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full" />
              </Link>

              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle navigation menu"
                aria-expanded={open}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 md:hidden"
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu — every page, flat list; Features expands as an accordion */}
        {open && (
          <div className="border-b border-white/10 bg-black/90 backdrop-blur-xl md:hidden">
            <div className="mx-auto max-w-7xl space-y-1 px-6 py-4 lg:px-8">
              {/* Features first, as an accordion (mirrors the desktop dropdown). */}
              <FeaturesAccordion />
              {navLinks.map((link) => (
                <NavLink
                  key={link.href}
                  to={link.href}
                  className={({ isActive }) =>
                    `block rounded-full px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 hover:text-white ${
                      isActive ? "bg-white/10 text-white" : "text-white/90"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              {[...secondaryNavLinks].map((link) => (
                <NavLink
                  key={link.href}
                  to={link.href}
                  className={({ isActive }) =>
                    `block rounded-full px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 hover:text-white ${
                      isActive ? "bg-white/10 text-white" : "text-white/90"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <a
                href={site.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-full px-4 py-2 text-sm font-medium text-white/90 transition-all hover:bg-white/10 hover:text-white"
              >
                GitHub
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Keeps the pre-existing in-flow 64px header height on inner pages. */}
      {!overlay && <div aria-hidden="true" className="h-16" />}
    </>
  );
}
