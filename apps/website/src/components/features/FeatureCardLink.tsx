import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { FeatureBox } from "../../content/featuresConfig";

interface FeatureCardLinkProps {
  box: FeatureBox;
  /** Override the box's own featured flag (e.g. keep grids even on the home). */
  featured?: boolean;
  className?: string;
}

/**
 * Whole-box feature link: the card itself is the <a>, with a hover lift,
 * visble focus ring, and a "Learn more →" affordance.
 */
export function FeatureCardLink({
  box,
  featured = box.featured ?? false,
  className = "",
}: FeatureCardLinkProps) {
  return (
    <Link
      to={box.href}
      className={`group flex h-full flex-col rounded-xl p-6 transition-all duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
        featured
          ? "border border-white/25 bg-gradient-to-b from-white/[0.07] to-white/[0.02] hover:border-white/40"
          : "border border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
      } ${className}`}
    >
      {featured && (
        <span className="mb-3 inline-flex w-fit items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-white">
          Featured
        </span>
      )}
      <h3 className="mb-2 text-lg font-semibold text-white">
        {featured && box.featuredHeadline ? box.featuredHeadline : box.title}
      </h3>
      <p className="text-sm leading-6 text-white/70">{box.description}</p>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-white/50 transition-colors group-hover:text-white">
        Learn more
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
