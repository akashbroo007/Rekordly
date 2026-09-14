import { Check, Download, ArrowRight } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ScreenshotFrame } from "../components/showcase/ScreenshotFrame";
import { FeatureCard } from "../components/shared/FeatureCard";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import { useCurrency } from "../lib/CurrencyContext";
import { features, safetyRails, site } from "../content/site";
import { useSeo } from "../lib/seo";

const BUY_URL = "https://buy.polar.sh/rekordly-pro";

type Cell = string | true;

interface ComparisonRow {
  capability: string;
  free: Cell;
  pro: Cell;
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
        free: "Unlimited",
        pro: "Unlimited",
      },
      {
        capability: "Creators you can add",
        free: "Unlimited",
        pro: "Unlimited",
      },
      {
        capability: "Live status dashboard (status, viewer counts, titles)",
        free: true,
        pro: true,
      },
    ],
  },
  {
    group: "Recording",
    rows: [
      {
        capability: "Auto-record creators",
        free: "Up to 2",
        pro: "Unlimited",
      },
      {
        capability: "Simultaneous live recordings",
        free: "Up to 5",
        pro: "Unlimited",
      },
      {
        capability: "Live recording length",
        free: "15 min per recording",
        pro: "Unlimited",
      },
      {
        capability:
          "Safety rails (pause switch, disk guardrail, segments, crash recovery)",
        free: true,
        pro: true,
      },
    ],
  },
  {
    group: "Downloads",
    rows: [
      {
        capability: "Download Manager (VODs & clips)",
        free: "Unlimited",
        pro: "Unlimited",
      },
      {
        capability: "Duration limit on normal downloads",
        free: "None",
        pro: "None",
      },
      {
        capability:
          "Audio-only (MP3) extraction, pause/resume, priorities, bandwidth limits",
        free: true,
        pro: true,
      },
    ],
  },
  {
    group: "Extras",
    rows: [
      {
        capability: "Secure Proxy + Cloudflare WARP support",
        free: true,
        pro: true,
      },
      {
        capability: "Local library & analytics",
        free: true,
        pro: true,
      },
      {
        capability: "Cloud uploads (Gofile, Catbox, MixDrop, Google Drive)",
        free: true,
        pro: true,
      },
      {
        capability:
          "Desktop integration (tray, notifications, themes, low-resource mode)",
        free: true,
        pro: true,
      },
      {
        capability: "Community plugins & Plugin SDK",
        free: true,
        pro: true,
      },
      {
        capability: "Commercial use",
        free: "Requires commercial license",
        pro: "Requires commercial license",
      },
    ],
  },
];

function ComparisonCell({ value }: { value: Cell }) {
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 text-white" aria-hidden="true" />;
  }
  return <span className="text-white/80">{value}</span>;
}

function FreeProComparison() {
  const { format } = useCurrency();

  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Free & Pro"
        title="Every feature, side by side"
        description="The free tier is permanent — not a trial — and it already covers the whole pipeline. Every Pro difference is a live-recording limit."
      />
      <Reveal className="mx-auto mt-12 max-w-4xl">
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="w-1/2 px-5 py-4 text-xs font-semibold tracking-wider text-white/50 uppercase">
                  Capability
                </th>
                <th className="px-5 py-4 text-center text-xs font-semibold tracking-wider text-white/50 uppercase">
                  Free
                </th>
                <th className="px-5 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                      Pro
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">
                      Most popular
                    </span>
                  </span>
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
          The Download Manager is never limited — a 3-hour VOD downloads in
          full on the free tier. Pro's unlimited recording, concurrency, and
          auto-record apply to personal use; commercial use requires a separate
          commercial license.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <ShimmerLinkButton
            href={BUY_URL}
            external
            className="font-semibold shadow-lg shadow-white/10"
          >
            Get Pro — {format(29)} lifetime
          </ShimmerLinkButton>
          <ShimmerLinkButton
            variant="outline"
            href="/download"
            className="font-medium"
          >
            Download free
          </ShimmerLinkButton>
          <ShimmerLinkButton
            variant="ghost"
            href="/pricing"
            className="font-medium"
          >
            Full plan comparison
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
          colSpan={3}
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
            <ComparisonCell value={row.free} />
          </td>
          <td className="px-5 py-3.5 text-center">
            <ComparisonCell value={row.pro} />
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
      "Every Rekordly feature: live monitoring across 7 sites, auto-record with safety rails, VOD downloads, built-in editor, cloud uploads, and a Secure Proxy for blocked networks.",
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

      <FreeProComparison />

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
