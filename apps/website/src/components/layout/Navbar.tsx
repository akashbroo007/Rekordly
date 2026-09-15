import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, Github, Menu, X } from "lucide-react";
import {
  navLinks,
  secondaryNavLinks,
  site,
} from "../../content/site";

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
              className="flex items-center text-xl font-bold text-white"
            >
              {site.name}
            </Link>
          </div>

          {/* Glassmorphic Navigation Pills (center) */}
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
