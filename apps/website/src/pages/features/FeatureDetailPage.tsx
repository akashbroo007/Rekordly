import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, Download } from "lucide-react";
import { Section, SectionHeading } from "../../components/layout/Section";
import { Reveal } from "../../components/shared/Reveal";
import { ShimmerLinkButton } from "../../components/hero/ShimmerButton";
import { RelatedFeatures } from "../../components/features/RelatedFeatures";
import {
  FEATURES_HUB_PATH,
  getFeaturePage,
} from "../../content/featuresConfig";
import { site } from "../../content/site";
import { breadcrumbSchema, useSeo } from "../../lib/seo";

interface FeatureDetailPageProps {
  /** Canonical page path, e.g. "/features/automation". */
  pagePath: string;
}

/**
 * Generic detail page for a feature. Everything — copy, section anchors,
 * SEO metadata, related links — comes from the features config.
 */
export default function FeatureDetailPage({
  pagePath,
}: FeatureDetailPageProps) {
  const page = getFeaturePage(pagePath);

  useSeo({
    title: page?.metaTitle ?? "Not found",
    description: page?.metaDescription ?? "This feature page does not exist.",
    path: page?.path ?? pagePath,
    noindex: !page,
    schema: page
      ? [
          breadcrumbSchema([
            { name: "Features", path: FEATURES_HUB_PATH },
            { name: page.name, path: page.path },
          ]),
        ]
      : [],
  });

  if (!page) {
    return (
      <Section className="text-center">
        <div className="mx-auto max-w-md">
          <CircleAlert className="mx-auto mb-4 h-10 w-10 text-white/30" />
          <h1 className="text-2xl font-bold text-white">Feature not found</h1>
          <p className="mt-3 text-white/70">That feature page does not exist.</p>
          <Link
            to={FEATURES_HUB_PATH}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Back to all features
          </Link>
        </div>
      </Section>
    );
  }

  return (
    <>
      <Section>
        {/* Breadcrumb: Features > Page name */}
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex items-center gap-2 text-sm text-white/50"
        >
          <Link
            to={FEATURES_HUB_PATH}
            className="transition-colors hover:text-white"
          >
            Features
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-white/80">{page.name}</span>
        </nav>

        <SectionHeading
          as="h1"
          align="left"
          eyebrow={page.name}
          title={page.heading}
          description={page.tagline}
        />
        <Reveal className="mt-8">
          <div className="flex flex-wrap gap-2">
            {page.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/70 transition-all hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                {section.heading}
              </a>
            ))}
          </div>
        </Reveal>
      </Section>

      <Section className="border-t border-white/10 pt-0">
        <div className="divide-y divide-white/10">
          {page.sections.map((section, index) => (
            // scroll-mt-24 keeps anchored headings clear of the sticky header.
            <div
              key={section.id}
              id={section.id}
              className="scroll-mt-24 grid grid-cols-1 items-start gap-8 py-14 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
            >
              <Reveal>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    {section.heading}
                  </h2>
                  <p className="mt-4 text-lg leading-7 text-white/70">
                    {section.lead}
                  </p>
                  {section.body && (
                    <p className="mt-4 text-sm leading-6 text-white/60">
                      {section.body}
                    </p>
                  )}
                </div>
              </Reveal>
              {section.bullets && (
                <Reveal delay={index === 0 ? 0.06 : 0}>
                  <ul className="space-y-3">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm leading-6 text-white/80"
                      >
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}
            </div>
          ))}
        </div>
      </Section>

      <RelatedFeatures page={page} />

      <Section className="border-t border-white/10 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Ready to try it?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/70">
            Free for personal use and installed in minutes — yt-dlp and ffmpeg
            are already inside.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <ShimmerLinkButton
              size="lg"
              href={site.releasesUrl}
              external
              className="font-semibold shadow-lg shadow-white/10"
            >
              <Download className="mr-2 h-4 w-4" />
              Download for Windows
            </ShimmerLinkButton>
            <ShimmerLinkButton
              size="lg"
              variant="outline"
              href="/features"
              className="font-semibold"
            >
              See all features
              <ArrowRight className="ml-2 h-4 w-4" />
            </ShimmerLinkButton>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
