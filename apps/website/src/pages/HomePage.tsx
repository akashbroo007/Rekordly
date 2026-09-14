import { ArrowRight, Building2, Check, Download, Github, Plug, Star } from "lucide-react";
import { Hero } from "../components/hero/Hero";
import { BeamsBackground } from "../components/hero/Beams";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Section, SectionHeading } from "../components/layout/Section";
import { ScreenshotFrame } from "../components/showcase/ScreenshotFrame";
import { FeatureCard } from "../components/shared/FeatureCard";
import { PlatformMatrix } from "../components/shared/PlatformMatrix";
import { FaqItem } from "../components/shared/FaqItem";
import {
  faqs,
  features,
  safetyRails,
  site,
  steps,
} from "../content/site";
import { Reveal } from "../components/shared/Reveal";
import { useCurrency } from "../lib/CurrencyContext";
import { useSeo, faqSchema, softwareAppSchema } from "../lib/seo";

function HowItWorks() {
  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps, then it runs itself"
        description="Rekordly was built for one job: making sure a stream you care about is never lost because you were asleep, at work, or simply forgot."
      />
      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <Reveal key={step.title} delay={index * 0.08} className="h-full">
            <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <span className="text-5xl font-bold text-white/10">
                {index + 1}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/70">
                {step.description}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Showcase() {
  return (
    <Section className="pt-4">
      <Reveal>
        <ScreenshotFrame
          src="./screenshots/dashboard.webp"
          alt="Rekordly dashboard showing live creator status, the recording queue, and the library"
          width={1800}
          height={1020}
          caption="The Rekordly dashboard — live status, recording queue, and your library in one window."
        />
      </Reveal>
    </Section>
  );
}

function FeatureGrid() {
  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Everything included"
        title="One app, the whole pipeline"
        description="From watching a status dot to pushing finished files to the cloud — every step lives in a single, local-first desktop app."
      />
      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <Reveal key={feature.title} delay={(index % 3) * 0.08} className="h-full">
            <FeatureCard
              title={feature.title}
              description={feature.description}
            />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function SafetyRails() {
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[#050505] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="mb-3 text-sm font-semibold tracking-wide text-white/60 uppercase">
                Unattended, but never reckless
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Auto-Record that respects your disk
              </h2>
              <p className="mt-4 text-lg leading-7 text-white/70">
                Recording while you sleep needs more than a naive "start when
                live" toggle. Rekordly ships a set of guardrails so unattended
                recording stays safe, reliable, and reversible.
              </p>
              <div className="mt-8">
                <ShimmerLinkButton href="/docs/auto-record" className="font-medium">
                  Read the docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </ShimmerLinkButton>
              </div>
            </div>
          </Reveal>
          <ul className="space-y-4">
            {safetyRails.map((rail, index) => (
              <Reveal key={rail.title} delay={index * 0.08}>
                <li className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                  <h3 className="font-semibold text-white">{rail.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-white/70">
                    {rail.description}
                  </p>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Platforms() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Supported platforms"
        title="Seven sites out of the box, infinitely extensible"
        description="Site support ships as plugins with capability detection, health checks, and per-plugin settings — new sites can be added without touching the core app."
      />
      <div className="mx-auto mt-16 max-w-3xl">
        <Reveal>
          <PlatformMatrix />
        </Reveal>
        <div className="mt-6 flex justify-center">
          <ShimmerLinkButton
            variant="outline"
            href="/plugins"
            className="font-medium"
          >
            <Plug className="mr-2 h-4 w-4" />
            Build your own plugin
          </ShimmerLinkButton>
        </div>
      </div>
    </Section>
  );
}

function Community() {
  const communityPoints = [
    "Every supported site is a plugin, built on the public Plugin SDK",
    "Capability detection and health checks are built into the SDK",
    "Developers can build integrations for platforms Rekordly does not support yet",
    "Community-built plugins are welcomed — open a pull request",
  ];

  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Built with the community"
        title="Designed to grow with its community"
        description="Rekordly is source available, the Plugin SDK is documented, and developers can build integrations for platforms that are not supported yet. The ecosystem is the roadmap."
      />
      <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-8">
            <ul className="space-y-4">
              {communityPoints.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-white/60"
                    aria-hidden="true"
                  />
                  <span className="leading-6 text-white/80">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-white/[0.02] p-8">
            <div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
                <Plug className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">
                Ship a site plugin
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Follow the plugin guide, implement a few responsibilities, and
                every Rekordly user can track your site. The guide covers the
                Plugin SDK, testing, and submitting your plugin.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <ShimmerLinkButton
                href={`${site.repoUrl}/blob/main/docs/PLUGIN_GUIDE.md`}
                external
                className="font-medium"
              >
                <Github className="mr-2 h-4 w-4" />
                Read the plugin guide
              </ShimmerLinkButton>
              <ShimmerLinkButton
                variant="outline"
                href="/plugins"
                className="font-medium"
              >
                Plugin system
                <ArrowRight className="ml-2 h-4 w-4" />
              </ShimmerLinkButton>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function ProductModel() {
  const { format, currency } = useCurrency();
  const tiers = [
    {
      name: "Free",
      price: "$0",
      note: "Personal and noncommercial use, forever",
      features: [
        "Unlimited creator monitoring",
        "Unlimited creators",
        "Auto-record up to 2 creators",
        "Up to 5 simultaneous live recordings, 15 minutes each",
        "Unlimited normal video/VOD downloads",
        "Local library",
        "Community plugins",
      ],
      cta: { label: "Download free", href: "/download" },
      external: false,
    },
    {
      name: "Pro",
      price: `${format(29)} one-time`,
      note:
        currency !== "USD"
          ? "Lifetime license for personal use (charged as $29 USD)"
          : "Lifetime license for personal use",
      features: [
        "Unlimited auto-recording creators",
        "Unlimited simultaneous recordings",
        "Unlimited recording length",
        "Everything in Free — no features removed",
        "7-day free trial available",
      ],
      cta: { label: "See Pro", href: "/pricing" },
      external: false,
    },
    {
      name: "Commercial",
      price: "Custom",
      note: "For businesses and commercial services",
      features: [
        "Commercial licensing",
        "For businesses, commercial services, redistribution, or other commercial use",
        "Contact Rekordly for licensing",
      ],
      cta: {
        label: "Contact us",
        href: `mailto:${site.email}?subject=Rekordly%20commercial%20license`,
      },
      external: true,
    },
  ];

  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Free & Pro"
        title="Free for personal use. Pro for power users."
        description="Rekordly is source-available and free for personal, educational, and other noncommercial use. Pro removes the live-recording limits; commercial use requires a separate commercial license."
      />
      <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        {tiers.map((tier, index) => (
          <Reveal key={tier.name} delay={index * 0.08} className="h-full">
            <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold text-white">
                  {tier.name}
                </h3>
                <span className="text-sm font-semibold text-white">
                  {tier.price}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/50">{tier.note}</p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-white/60"
                      aria-hidden="true"
                    />
                    <span className="leading-6 text-white/80">{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <ShimmerLinkButton
                  variant="outline"
                  href={tier.cta.href}
                  external={tier.external}
                  className="w-full font-medium"
                >
                  {tier.cta.label}
                </ShimmerLinkButton>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <ShimmerLinkButton
          variant="ghost"
          href="/pricing"
          className="font-medium"
        >
          <Building2 className="mr-2 h-4 w-4" />
          Full plan comparison
          <ArrowRight className="ml-2 h-4 w-4" />
        </ShimmerLinkButton>
      </div>
    </Section>
  );
}

function Faq() {
  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="FAQ"
        title="Questions, answered"
      />
      <div className="mx-auto mt-16 max-w-3xl space-y-3">
        {faqs.map((faq, index) => (
          <Reveal key={faq.question} delay={index * 0.05}>
            <FaqItem {...faq} />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-white/10">
      <BeamsBackground
        className="absolute inset-0 z-0 opacity-50"
        beamHeight={10}
        beamNumber={10}
        speed={1.8}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black via-transparent to-black" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 text-center lg:px-8 sm:py-28">
        <Reveal>
          <Star className="mx-auto mb-6 h-4 w-4 fill-white text-white" />
          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Stop refreshing.{" "}
            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Start recording.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
            Download Rekordly, add your first creator, and let the app handle the
            rest — tonight.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
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
              href="/docs"
              className="font-semibold"
            >
              Read the docs
            </ShimmerLinkButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function HomePage() {
  useSeo({
    title: "Rekordly — Monitor, record, and download live streams",
    description:
      "A free, source-available Windows desktop app for monitoring creators, automatically recording live streams, downloading videos and VODs, and organizing your recordings.",
    path: "/",
    schema: [faqSchema(faqs), softwareAppSchema()],
  });

  return (
    <>
      <Hero />
      <Showcase />
      <HowItWorks />
      <FeatureGrid />
      <SafetyRails />
      <Platforms />
      <Community />
      <ProductModel />
      <Faq />
      <FinalCta />
    </>
  );
}
