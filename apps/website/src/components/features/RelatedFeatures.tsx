import { Section, SectionHeading } from "../layout/Section";
import { Reveal } from "../shared/Reveal";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  relatedFeaturesForPage,
  type FeaturePageDef,
} from "../../content/featuresConfig";

interface RelatedFeaturesProps {
  page: FeaturePageDef;
}

/**
 * Strip of links to other feature pages/sections, generated from the
 * features config. Rendered at the bottom of every feature page.
 */
export function RelatedFeatures({ page }: RelatedFeaturesProps) {
  const related = relatedFeaturesForPage(page);

  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Related features"
        title="More of the pipeline"
        description="Rekordly covers the whole flow — monitoring, capture, organizing, and sharing. Here is the rest."
      />
      <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((item, index) => (
          <Reveal key={item.title} delay={(index % 3) * 0.05} className="h-full">
            <Link
              to={item.href}
              className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span className="text-sm font-semibold text-white">
                {item.title}
              </span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs font-medium text-white/50 transition-colors group-hover:text-white">
                Learn more
                <ArrowRight
                  className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
