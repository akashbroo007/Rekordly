import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown, Github, Menu, X } from "lucide-react";
import {
  navLinks,
  secondaryNavLinks,
  site,
} from "../../content/site";

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close on any navigation and on outside click / Escape.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = secondaryNavLinks.some(
    (link) => link.href === location.pathname,
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 hover:text-white ${
          isActive ? "bg-white/10 text-white" : "text-white/90"
        }`}
      >
        More
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          {secondaryNavLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              role="menuitem"
              className={({ isActive: active }) =>
                `block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // On the landing page the nav floats over the full-screen hero beams
  // (reference behavior); on inner pages it flows normally.
  const overlay = location.pathname === "/";

  return (
    <nav
      className={`z-20 w-full ${overlay ? "absolute inset-x-0 top-0" : "relative"}`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* 3-column grid keeps the pill nav truly centered regardless of
            brand/CTA widths; columns collapse to flex on small screens. */}
        <div className="flex h-16 items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4">
          {/* Brand (left) */}
          <div className="flex items-center justify-start">
            <Link
              to="/"
              className="flex items-center gap-2 text-xl font-bold text-white"
            >
              <img
                src="./icon.png"
                alt=""
                width={24}
                height={24}
                className="h-6 w-6"
              />
              {site.name}
            </Link>
          </div>

          {/* Glassmorphic Navigation Pills (center) — primary links + More */}
          <div className="hidden md:flex items-center space-x-1 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 p-1">
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
            <MoreMenu />
          </div>

          {/* CTA (right) */}
          <div className="flex items-center justify-end space-x-4">
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
            <Link
              to="/download"
              className="group relative inline-flex overflow-hidden rounded-full items-center justify-center h-9 px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 bg-white text-black hover:bg-gray-100"
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

      {/* Mobile menu — every page, flat list */}
      {open && (
        <div className="border-b border-white/10 bg-black/90 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-7xl space-y-1 px-6 py-4 lg:px-8">
            {[...navLinks, ...secondaryNavLinks].map((link) => (
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
  );
}
