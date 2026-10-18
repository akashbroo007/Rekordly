import { ArrowRight, Check, Download, HardDrive, MonitorPlay, Radio, ShieldCheck } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import { FaqItem } from "../components/shared/FaqItem";
import { PlatformMatrix } from "../components/shared/PlatformMatrix";
import { site } from "../content/site";
import { faqSchema, softwareAppSchema, useSeo } from "../lib/seo";

const pageFaqs = [
  {
    question: "Can Rekordly record adult live streams?",
    answer:
      "Yes — for the platforms it supports. Rekordly ships with plugins for several live-cam platforms (Chaturbate, Stripchat, BongaCams, Cam4, CamSoda, Jerkmate, Streamate, MyFreeCams, Dreamcam) alongside generic streaming platforms (Twitch, YouTube, Rumble, Kick). Each plugin provides live detection and recording; some also support VOD downloads. Rekordly does not record from arbitrary adult websites — support is per-plugin, and the always-current capability matrix is on this page and in the docs.",
  },
  {
    question: "Does recording happen automatically?",
    answer:
      "Yes. You add a creator once, and Rekordly monitors their status on a configurable interval. When they go live, recording starts automatically and stops cleanly when the stream ends. Manual one-click recording from the dashboard is also available.",
  },
  {
    question: "Do I need to install anything besides Rekordly?",
    answer:
      "No. Both yt-dlp and ffmpeg are bundled inside the app, so recording works out of the box on Windows 10 and 11 — no external installs, no configuration.",
  },
  {
    question: "Where are the recordings saved?",
    answer:
      "On your own machine. Every recording is organized into a searchable local library with tags, collections, favorites, and notes, backed by a local SQLite database. Nothing is uploaded anywhere unless you explicitly configure a cloud provider.",
  },
  {
    question: "My ISP blocks the site I want to record from — does that matter?",
    answer:
      "Rekordly includes a built-in Secure Proxy you can enable per creator with one toggle. It runs on the Tor network, so it is slower; if you install Cloudflare WARP (free), Rekordly detects it and recordings automatically go full speed.",
  },
  {
    question: "Is it free?",
    answer:
      "Rekordly is free for personal, educational, and other noncommercial use, under the PolyForm Noncommercial license. Everything is included — unlimited creator monitoring, unlimited live recordings, and unlimited downloads. Commercial use requires a separate commercial license.",
  },
  {
    question: "Is recording streams allowed?",
    answer:
      "That depends on the platform's terms and the laws in your jurisdiction. You are responsible for ensuring that your recording and downloading activity complies with applicable laws, platform terms, copyright requirements, and any required permissions. Rekordly provides the tooling; it does not grant permission to record any content.",
  },
] as const;

const capabilities = [
  {
    icon: Radio,
    title: "Automatic live recording",
    description:
      "Rekordly checks each monitored creator on a configurable interval and starts recording the moment they go live — no browser tab left open, nothing to remember.",
  },
  {
    icon: MonitorPlay,
    title: "Creator monitoring",
    description:
      "Track creators across supported platforms from one dashboard with live/offline status, viewer counts, and stream titles updating in real time.",
  },
  {
    icon: HardDrive,
    title: "Local library & downloads",
    description:
      "Every capture is filed into a searchable local library. VOD and clip downloads are handled by a dedicated Download Manager with pause, resume, and retry.",
  },
  {
    icon: ShieldCheck,
    title: "Safe, unattended operation",
    description:
      "A master pause switch, disk-space guardrail, segment splitting, and crash recovery keep unattended recording safe — your drive never fills silently.",
  },
] as const;

function HowItWorks() {
  const steps = [
    {
      title: "Add a creator",
      description:
        "Pick the platform's plugin, enter the username, and start tracking. Live status updates in real time.",
    },
    {
      title: "Enable Auto-Record",
      description:
        "Flip the per-creator switch. Recording starts the moment they go live and stops when the stream ends.",
    },
    {
      title: "Find it in your library",
      description:
        "Recordings land in a searchable local library with tags, collections, and notes — or push them to cloud storage.",
    },
  ];

  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="How it works"
        title="Add the creator once — Rekordly handles the rest"
        description="The same three-step workflow every Rekordly user gets, regardless of platform."
      />
      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <Reveal key={step.title} delay={index * 0.08} className="h-full">
            <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <span className="text-5xl font-bold text-white/10">{index + 1}</span>
              <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">{step.description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export default function AdultStreamRecordingPage() {
  useSeo({
    title: "Adult Live Stream Recording Software",
    description:
      "Rekordly is Windows software for monitoring supported creators and automatically recording live streams from supported platforms — including live-cam sites. Free for personal use.",
    path: "/adult-stream-recording",
    schema: [faqSchema(pageFaqs), softwareAppSchema()],
  });

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Use case"
          as="h1"
          title="Adult Live Stream Recording Software"
          description="Rekordly is a Windows desktop application for monitoring supported creators and automatically recording live streams from supported platforms — including age-restricted live-cam platforms — with a searchable local library for everything you capture."
        />
        <Reveal className="mx-auto mt-10 max-w-3xl">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
            <p className="text-sm leading-7 text-white/70">
              Rekordly supports several major live-cam platforms through its
              plugin system, alongside generic streaming platforms like Twitch
              and YouTube. The capability matrix below reflects what each
              bundled plugin implements today — Rekordly does not record from
              arbitrary adult websites, and support is always per-platform.
              The same core app handles every platform: monitoring, automatic
              recording, the Download Manager, and the local library.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                "Automatic recording the moment a creator goes live",
                "Creator monitoring with real-time live status",
                "VOD and clip downloads where the platform supports them",
                "Everything stored locally — no account, no telemetry",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
                  <span className="leading-6 text-white/80">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <ShimmerLinkButton
            size="lg"
            href={site.releasesUrl}
            external
            className="font-semibold shadow-lg shadow-white/10"
          >
            <Download className="mr-2 h-4 w-4" />
            Download for Windows
          </ShimmerLinkButton>
          <ShimmerLinkButton size="lg" variant="outline" href="/docs/getting-started" className="font-semibold">
            Getting started
            <ArrowRight className="ml-2 h-4 w-4" />
          </ShimmerLinkButton>
        </div>
      </Section>

      <Section className="pt-4">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {capabilities.map((item, index) => (
            <Reveal key={item.title} delay={(index % 2) * 0.08}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mb-2 text-lg font-semibold text-white">{item.title}</h2>
                <p className="text-sm leading-6 text-white/70">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-y border-white/10 bg-[#050505]">
        <SectionHeading
          eyebrow="Supported platforms"
          title="What each supported platform can do"
          description="Capability support can differ per platform — live detection, automatic recording, and downloads are declared per plugin. This table mirrors what the bundled plugins implement today."
        />
        <div className="mx-auto mt-12 max-w-3xl">
          <Reveal>
            <PlatformMatrix />
          </Reveal>
          <p className="mt-6 text-center text-sm text-white/60">
            Full platform details, including VR (3D) support and blocked-network
            handling, are in the{" "}
            <a href="/docs/platforms" className="underline decoration-white/30 underline-offset-4 hover:text-white">
              Supported Platforms
            </a>{" "}
            documentation.
          </p>
        </div>
      </Section>

      <HowItWorks />

      <Section className="border-t border-white/10">
        <SectionHeading eyebrow="FAQ" title="Common questions" />
        <div className="mx-auto mt-16 max-w-3xl space-y-3">
          {pageFaqs.map((faq, index) => (
            <Reveal key={faq.question} delay={index * 0.05}>
              <FaqItem {...faq} />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-t border-white/10 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Ready to try it?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/70">
            Free for personal use, installed in minutes, and it looks the same
            as it does for every other Rekordly user — one professional
            desktop app for stream recording.
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
            <ShimmerLinkButton size="lg" variant="outline" href="/marketplace" className="font-semibold">
              Browse platform plugins
            </ShimmerLinkButton>
          </div>
          <p className="mx-auto mt-10 max-w-2xl text-xs leading-5 text-white/40">
            Users are responsible for ensuring that their recording and
            downloading activity complies with applicable laws, platform
            terms, copyright requirements, and any required permissions.
            Rekordly does not grant permission to record content and is not
            affiliated with, endorsed by, or sponsored by any of the supported
            platforms. Rekordly is intended for users 18 years or older.
          </p>
        </Reveal>
      </Section>
    </>
  );
}
