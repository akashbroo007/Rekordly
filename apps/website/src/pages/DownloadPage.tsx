import { ArrowRight, Cpu, Download, FolderDown, RefreshCw, ShieldCheck } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import { site } from "../content/site";

const builds = [
  {
    icon: <Download className="h-5 w-5" />,
    title: "Installer",
    file: "Rekordly Setup <version>.exe",
    description:
      "The normal way to install. Adds Start Menu shortcuts and registers the app for automatic updates.",
  },
  {
    icon: <FolderDown className="h-5 w-5" />,
    title: "Portable",
    file: "Rekordly-<version>-portable.exe",
    description:
      "No installation step. Runs standalone from any folder — great for USB sticks and locked-down machines.",
  },
] as const;

const highlights = [
  {
    icon: <ShieldCheck className="h-4 w-4" />,
    text: "yt-dlp and ffmpeg are vendored — nothing else to install",
  },
  {
    icon: <RefreshCw className="h-4 w-4" />,
    text: "Self-updating against GitHub Releases",
  },
  {
    icon: <Download className="h-4 w-4" />,
    text: "Windows 10+ (64-bit), no runtime dependencies",
  },
] as const;

const tiers = [
  {
    name: "Low-end",
    verdict:
      "Runs comfortably with Low-Resource Mode: one recording at a time, serial downloads to protect your HDD, no animations.",
  },
  {
    name: "Medium",
    verdict:
      "Comfortable defaults: 2–3 recordings at once, staggered starts, live checks every 120 seconds.",
  },
  {
    name: "High-end",
    verdict:
      "Built for bulk: ~30 simultaneous recordings stay copy-only — under 85% CPU and 6 GB RAM.",
  },
] as const;

const specRows = [
  { label: "CPU", values: ["2 cores", "4 cores", "6+ cores"] },
  { label: "RAM", values: ["4 GB", "8 GB", "16 GB"] },
  { label: "Storage", values: ["HDD or SSD", "SSD", "SSD"] },
  {
    label: "Concurrent recordings",
    values: ["1", "Up to 5 (free)", "10–30 (Pro)"],
  },
  { label: "Concurrent downloads", values: ["1", "3", "Up to 10"] },
  { label: "Live site checks", values: ["2 at a time", "5 at a time", "5 at a time"] },
  {
    label: "Recommended mode",
    values: ["Low-Resource Mode on", "Default settings", "Default settings"],
  },
] as const;

function SystemRequirements() {
  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="System requirements"
        title="From old laptops to recording rigs"
        description="How many streams Rekordly can download at once depends on your hardware. Recording is copy-only — no live re-encoding — so CPU scales with how many streams you watch, not video quality."
      />
      <Reveal className="mx-auto mt-12 max-w-4xl">
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="w-44 px-5 py-4 align-top text-xs font-semibold tracking-wider text-white/50 uppercase">
                  <span className="inline-flex items-center gap-2">
                    <Cpu className="h-4 w-4" aria-hidden="true" />
                    Spec
                  </span>
                </th>
                {tiers.map((tier) => (
                  <th key={tier.name} className="px-5 py-4 align-top">
                    <span className="block text-base font-semibold text-white">
                      {tier.name}
                    </span>
                    <span className="mt-1.5 block text-xs leading-5 font-normal text-white/50">
                      {tier.verdict}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {specRows.map((row, index) => (
                <tr
                  key={row.label}
                  className={
                    index < specRows.length - 1
                      ? "border-b border-white/5"
                      : undefined
                  }
                >
                  <td className="px-5 py-3 font-medium text-white/70">
                    {row.label}
                  </td>
                  {row.values.map((value) => (
                    <td key={value} className="px-5 py-3 text-white/80">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-6 text-white/50">
          Recording is a straight copy — never a live transcode — so disk writes
          happen at stream bitrate. The free tier caps live recordings at 5
          concurrent (15 minutes each); the Download Manager has no duration
          limits on normal video/VOD downloads. Pro removes the live-recording
          caps. Rekordly detects your hardware on first launch and suggests the
          right mode for you.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <ShimmerLinkButton
            variant="outline"
            href="/docs/troubleshooting"
            className="font-medium"
          >
            Performance troubleshooting
            <ArrowRight className="ml-2 h-4 w-4" />
          </ShimmerLinkButton>
          <ShimmerLinkButton
            variant="ghost"
            href="/pricing"
            className="font-medium"
          >
            See what Pro unlocks
          </ShimmerLinkButton>
        </div>
      </Reveal>
    </Section>
  );
}

export default function DownloadPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Download"
          title="Get Rekordly for Windows"
          description="Free for personal use under the PolyForm Noncommercial license. Every release ships an installer and a portable build."
        />
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
          {builds.map((build, index) => (
            <Reveal key={build.title} delay={index * 0.08} className="h-full">
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
                  {build.icon}
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {build.title}
                </h3>
                <p className="mt-1 font-mono text-xs text-white/50">
                  {build.file}
                </p>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {build.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-10 text-center">
          <ShimmerLinkButton
            size="lg"
            href={site.releasesUrl}
            external
            className="font-semibold shadow-lg shadow-white/10"
          >
            <Download className="mr-2 h-4 w-4" />
            Go to GitHub Releases
          </ShimmerLinkButton>
        </div>
      </Section>

      <Section className="border-t border-white/10">
        <Reveal className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-2xl font-bold text-white">
            Before you install
          </h2>
          <ul className="space-y-4">
            {highlights.map((item) => (
              <li
                key={item.text}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm"
              >
                <span className="mt-0.5 text-white">{item.icon}</span>
                <span className="leading-6 text-white/80">{item.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-6 text-white/60">
            Windows SmartScreen may warn on first run because the installer is
            not yet code-signed. Click <strong className="text-white">More info → Run anyway</strong>, or use the portable
            build instead.
          </p>
          <div className="mt-8">
            <ShimmerLinkButton
              variant="outline"
              href="/docs/installation"
              className="font-medium"
            >
              Full installation guide
              <ArrowRight className="ml-2 h-4 w-4" />
            </ShimmerLinkButton>
          </div>
        </Reveal>
      </Section>

      <SystemRequirements />
    </>
  );
}
