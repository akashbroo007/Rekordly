import { Link } from "react-router-dom";
import { Globe, Github } from "lucide-react";
import { navLinks, secondaryNavLinks, site } from "../../content/site";
import { useCurrency } from "../../lib/CurrencyContext";
import { CURRENCY_OPTIONS } from "../../lib/currency";

const footerNav = [
  {
    heading: "Product",
    // Full product nav — the navbar only shows the top three.
    links: [...navLinks, ...secondaryNavLinks],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Blog", href: "/blog" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Changelog", href: `${site.repoUrl}/blob/main/docs/CHANGELOG.md` },
      { label: "Plugin guide", href: site.pluginGuideUrl },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
] as const;

export function Footer() {
  const { currency, setCurrency } = useCurrency();

  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-3 gap-6 md:grid-cols-[1.5fr_repeat(3,1fr)] md:gap-12">
          <div className="col-span-3 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <img
                src="./icon.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7"
              />
              <span className="text-lg font-bold text-white">{site.name}</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/60">
              {site.tagline} Free for personal and noncommercial use.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href={site.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors focus-within:border-white/30 hover:bg-white/10">
                <Globe
                  className="h-4 w-4 shrink-0 text-white/60"
                  aria-hidden="true"
                />
                <label htmlFor="footer-currency" className="sr-only">
                  Currency
                </label>
                <select
                  id="footer-currency"
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value as typeof currency)
                  }
                  className="cursor-pointer bg-transparent pr-1 text-sm text-white/90 focus:outline-none [&>option]:bg-black [&>option]:text-white"
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} — {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {footerNav.map((group) => (
            <div key={group.heading}>
              <h3 className="text-sm font-semibold text-white">
                {group.heading}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) =>
                  link.href.startsWith("/") ? (
                    <li key={link.label}>
                      <Link
                        to={link.href}
                        className="text-sm text-white/60 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-white/60 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 md:mt-14 md:flex-row md:items-center md:justify-between">
          <p className="text-xs leading-5 text-white/50">
            © {new Date().getFullYear()} {site.name}. Source available under
            the{" "}
            <a
              href={site.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white/80"
            >
              PolyForm Noncommercial License 1.0.0
            </a>
            . Free for personal use; commercial use requires a license.
          </p>
          <p className="max-w-xl text-xs leading-5 text-white/50">
            Not affiliated with, endorsed by, or sponsored by any of the
            supported streaming platforms.
          </p>
        </div>
      </div>
    </footer>
  );
}
