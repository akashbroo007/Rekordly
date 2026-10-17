import { Check, Download, ArrowRight } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ScreenshotFrame } from "../components/showcase/ScreenshotFrame";
import { FeatureCard } from "../components/shared/FeatureCard";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import { features, safetyRails, site } from "../content/site";
import { useSeo } from "../lib/seo";

interface ComparisonRow {
  capability: string;
  included: string | true;
}

interface ComparisonGroup {
  group: string;
  rows: ComparisonRow[];
}

const comparisonGroups: ComparisonGroup[] = [
  {
    group: "Monitoring",
    rows: [
      {
        capability: "Creator monitoring",
        included: "Unlimited",
      },
      {
        capability: "Creators you can add",
        included: "Unlimited",
      },
      {
        capability: "Live status dashboard (status, viewer counts, titles)",
        included: true,
      },
    ],
  },
  {
    group: "Recording",
    rows: [
      {
        capability: "Auto-record creators",
        included: "Unlimited",
      },
      {
        capability: "Simultaneous live recordings",
        included: "Unlimited",
      },
      {
        capability: "Live recording length",
        included: "Unlimited",
      },
      {
        capability:
          "Safety rails (pause switch, disk guardrail, segments, crash recovery)",
        included: true,
      },
    ],
  },
  {
    group: "Downloads",
    rows: [
      {
        capability: "Download Manager (VODs & clips)",
        included: "Unlimited",
      },
      {
        capability: "Duration limit on normal downloads",
        included: "None",
      },
      {
        capability:
          "Audio-only (MP3) extraction, pause/resume, priorities, bandwidth limits",
        included: true,
      },
    ],
  },
  {
    group: "Notifications & control",
    rows: [
      {
        capability: "Push notifications (Discord / Telegram)",
        included: true,
      },
      {
        capability:
          "Remote control from Telegram (record, pause, resume, stop from chat)",
        included: true,
      },
    ],
  },
  {
    group: "Extras",
    rows: [
      {
        capability: "Secure Proxy + Cloudflare WARP support",
        included: true,
      },
      {
        capability: "Local library & analytics",
        included: true,
      },
      {
        capability: "Cloud uploads (Gofile, Catbox, MixDrop, Google Drive)",
        included: true,
      },
      {
        capability:
          "Desktop integration (tray, notifications, themes, low-resource mode)",
        included: true,
      },
      {
        capability: "Community plugins & Plugin SDK",
        included: true,
      },
      {
        capability: "Commercial use",
        included: "Requires commercial license",
      },
    ],
  },
];

function ComparisonCell({ value }: { value: string | true }) {
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 text-white" aria-hidden="true" />;
  }
  return <span className="text-white/80">{value}</span>;
}

function FeatureComparison() {
  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Everything included"
        title="Every feature, side by side"
        description="One free app, the whole pipeline. No tiers, no locked features — every capability below is in the standard download."
      />
      <Reveal className="mx-auto mt-12 max-w-4xl">
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="w-2/3 px-5 py-4 text-xs font-semibold tracking-wider text-white/50 uppercase">
                  Capability
                </th>
                <th className="px-5 py-4 text-center text-xs font-semibold tracking-wider text-white/50 uppercase">
                  Included
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonGroups.map((group) => (
                <GroupBlock key={group.group} group={group} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs leading-6 text-white/50">
          Nothing is metered — a 3-hour live stream records in full, and a
          3-hour VOD downloads in full. All included features apply to
          personal use; commercial use requires a separate commercial license.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <ShimmerLinkButton
            href="/download"
            className="font-semibold shadow-lg shadow-white/10"
          >
            Download free
          </ShimmerLinkButton>
          <ShimmerLinkButton
            variant="ghost"
            href="/docs/overview"
            className="font-medium"
          >
            Read the docs
            <ArrowRight className="ml-2 h-4 w-4" />
          </ShimmerLinkButton>
        </div>
      </Reveal>
    </Section>
  );
}

function GroupBlock({ group }: { group: ComparisonGroup }) {
  return (
    <>
      <tr>
        <td
          colSpan={2}
          className="bg-white/[0.04] px-5 py-2.5 text-xs font-semibold tracking-wider text-white/60 uppercase"
        >
          {group.group}
        </td>
      </tr>
      {group.rows.map((row, index) => (
        <tr
          key={row.capability}
          className={
            index < group.rows.length - 1 ? "border-b border-white/5" : undefined
          }
        >
          <td className="px-5 py-3.5 font-medium text-white/80">
            {row.capability}
          </td>
          <td className="px-5 py-3.5 text-center">
            <ComparisonCell value={row.included} />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function FeaturesPage() {
  useSeo({
    title: "Features — monitoring, auto-record, downloads, editor & more",
    description:
      "Every Rekordly feature: live monitoring across 8 sites, auto-record with safety rails, VOD downloads, built-in editor, cloud uploads, and a Secure Proxy for blocked networks.",
    path: "/features",
  });

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Features"
          as="h1"
          title="Everything Rekordly does"
          description="A local-first desktop app that covers the whole pipeline: watching, capturing, organizing, and pushing to the cloud."
        />
      </Section>

      <Section className="pt-0">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

      <FeatureComparison />

      <Section className="border-y border-white/10 bg-[#050505]">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-wide text-white/60 uppercase">
              Auto-Record
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Recording you can walk away from
            </h2>
            <p className="mt-4 text-lg leading-7 text-white/70">
              Auto-Record is an opt-in, per-creator switch that captures every
              stream unattended — with guardrails so it never fills your disk,
              hangs on a crashed stream, or loses a capture to a power cut.
            </p>
            <div className="mt-8">
              <ShimmerLinkButton href="/docs/auto-record" className="font-medium">
                Full Auto-Record reference
                <ArrowRight className="ml-2 h-4 w-4" />
              </ShimmerLinkButton>
            </div>
          </div>
          <ul className="space-y-4">
            {safetyRails.map((rail) => (
              <li
                key={rail.title}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-5"
              >
                <h3 className="font-semibold text-white">{rail.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-white/70">
                  {rail.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Product walkthrough"
          title="See Rekordly in action"
          description="Watch the full flow — add a creator, catch a stream going live, record it, and find it organized in your library. Under two minutes, no narration needed."
        />
        <Reveal className="mt-12">
          <ScreenshotFrame
            videoSrc="./demo/rekordly-demo.mp4"
            poster="./screenshots/dashboard.webp"
            src="./screenshots/dashboard.webp"
            alt="Rekordly product walkthrough video showing creator setup, live monitoring, recording, and library"
            width={1800}
            height={1020}
            caption="Product walkthrough — monitoring, recording, and library in one flow."
          />
        </Reveal>
      </Section>

      <Section className="border-t border-white/10 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Ready to try it?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/70">
            Free for personal use and installed in minutes — yt-dlp and
            ffmpeg are already inside.
          </p>
          <div className="mt-8">
            <ShimmerLinkButton
              size="lg"
              href={site.releasesUrl}
              external
              className="font-semibold shadow-lg shadow-white/10"
            >
              <Download className="mr-2 h-4 w-4" />
              Download for Windows
            </ShimmerLinkButton>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
