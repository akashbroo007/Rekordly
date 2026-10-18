import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Reveal } from "../shared/Reveal";
import { featuredFeatureBox } from "../../content/featuresConfig";

/**
 * Full-width homepage banner for Post-Recording Automation, driven by the
 * featured box in the features config.
 */
export function AutomationBanner() {
  return (
    <section className="border-t border-white/10 bg-[#050505]">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:px-8">
        <Reveal>
          <Link
            to={featuredFeatureBox.href}
            className="group relative block overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r from-white/[0.08] via-white/[0.03] to-transparent p-8 transition-all duration-200 hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:p-12"
          >
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/[0.07] blur-3xl"
              aria-hidden="true"
            />
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-white">
              Featured
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Archive and share on autopilot
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-7 text-white/70">
              Post-Recording Automation turns every finished capture into a
              finished product: tag it, compress it, move it to your archive,
              upload it, and free the source. Each step optional — and a
              failure never blocks the rest.
            </p>
            <span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white">
              Explore Post-Recording Automation
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
