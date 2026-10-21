import { Link } from "react-router-dom";
import { ArrowRight, Download, Star } from "lucide-react";
import { Hero } from "../components/hero/Hero";
import { BeamsBackground } from "../components/hero/Beams";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Section, SectionHeading } from "../components/layout/Section";
import { ScreenshotFrame } from "../components/showcase/ScreenshotFrame";
import { FeatureCardLink } from "../components/features/FeatureCardLink";
import { AutomationBanner } from "../components/features/AutomationBanner";
import { PlatformStrip } from "../components/shared/PlatformStrip";
import { FaqItem } from "../components/shared/FaqItem";
import { homepageFaqs, platforms, site, steps } from "../content/site";
import { homeFeatureBoxes } from "../content/featuresConfig";
import { Reveal } from "../components/shared/Reveal";
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
        {homeFeatureBoxes.map((box, index) => (
          <Reveal key={box.title} delay={(index % 3) * 0.08} className="h-full">
            <FeatureCardLink box={box} featured={false} />
          </Reveal>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Link
          to="/features"
          className="group inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-white/80"
        >
          See all features
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </div>
    </Section>
  );
}

function Platforms() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Supported platforms"
        title={`${platforms.length} sites supported`}
      />
      <div className="mt-14">
        <Reveal>
          <PlatformStrip />
        </Reveal>
      </div>
      <div className="mt-8 text-center">
        <Link
          to="/docs/platforms"
          className="group inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-white/80"
        >
          View full compatibility
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </div>
    </Section>
  );
}

function ProductModel() {
  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Free & open source"
        title="Free and open source. Everything included."
        description="Licensed under Apache-2.0 — free for everyone, personal or commercial, with no tiers and no locked features."
      />
      <Reveal>
        <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-center gap-5 rounded-xl border border-white/10 bg-white/[0.02] p-6 sm:flex-row sm:gap-8">
          <ShimmerLinkButton href="/download" className="w-full font-medium sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Download
          </ShimmerLinkButton>
          <Link
            to="/docs/license"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-white/80"
          >
            License
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </div>
      </Reveal>
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
        {homepageFaqs.map((faq, index) => (
          <Reveal key={faq.question} delay={index * 0.05}>
            <FaqItem question={faq.question} answer={faq.answer} />
          </Reveal>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-white/60">
        More questions? Read the{" "}
        <Link
          to="/docs/faq"
          className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
        >
          full FAQ
        </Link>
        .
      </p>
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
              href={site.installerDownloadUrl}
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
    title: "Rekordly — Free Stream & Cam Site Recorder for Windows",
    description:
      "Free Windows app to record live streams and cam sites (Stripchat, BongaCams, Chaturbate & more) automatically — monitor creators, download VODs, and organize everything in a local library.",
    path: "/",
    schema: [faqSchema(homepageFaqs), softwareAppSchema()],
  });

  return (
    <>
      <Hero />
      <Showcase />
      <HowItWorks />
      <FeatureGrid />
      <AutomationBanner />
      <Platforms />
      <ProductModel />
      <Faq />
      <FinalCta />
    </>
  );
}
