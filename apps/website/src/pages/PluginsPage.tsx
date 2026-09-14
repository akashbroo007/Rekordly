import {
  ArrowRight,
  CheckCircle2,
  HeartPulse,
  Layers,
  Puzzle,
  ShieldCheck,
} from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import { site } from "../content/site";
import { useSeo } from "../lib/seo";

const pillars = [
  {
    icon: <Puzzle className="h-5 w-5" />,
    title: "Plugin first",
    description:
      "A site is a plugin or it doesn't exist. Supporting a new site never requires touching the core app — the plugin ships, the site works.",
  },
  {
    icon: <Layers className="h-5 w-5" />,
    title: "Capability detection",
    description:
      "Plugins declare what they support — live detection, recording, downloads — and the dashboard adapts to show only what a site can actually do.",
  },
  {
    icon: <HeartPulse className="h-5 w-5" />,
    title: "Health checks",
    description:
      "Per-plugin diagnostics track failures over time. When a site redesigns its pages, the failure stays isolated and visible instead of breaking the app.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Validated loading",
    description:
      "Plugins are checked against the SDK interface at load time. A malformed plugin is rejected with a clear error, never a mystery crash.",
  },
] as const;

const responsibilities = [
  "Stream extraction — resolve a creator page into a playable stream",
  "Monitoring — report live status, viewer count, and stream title",
  "Metadata — normalize site details into the standard stream object",
  "Authentication — optional credential flows when a site needs them",
] as const;

export default function PluginsPage() {
  useSeo({
    title: "Plugins — add support for any streaming site",
    description:
      "Rekordly site support ships as plugins with a typed SDK, capability detection, and health checks. Build a plugin for your favorite streaming site in an afternoon.",
    path: "/plugins",
  });

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Plugins"
          as="h1"
          title="Site support that never goes stale"
          description="Rekordly's plugin system keeps the core app small and the ecosystem open. Site logic lives in plugins with capability detection, health checks, and per-plugin settings."
        />
      </Section>

      <Section className="pt-0">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {pillars.map((pillar, index) => (
            <Reveal key={pillar.title} delay={(index % 2) * 0.08}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
                  {pillar.icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {pillar.title}
                </h3>
                <p className="text-sm leading-6 text-white/70">
                  {pillar.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-y border-white/10 bg-[#050505]">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="mb-3 text-sm font-semibold tracking-wide text-white/60 uppercase">
                Write your own
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Ship a site plugin in an afternoon
              </h2>
              <p className="mt-4 text-lg leading-7 text-white/70">
                The plugin SDK is a small, typed public API. Follow the guide,
                implement four responsibilities, and every Rekordly user can
                track your site.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <ShimmerLinkButton
                  href={site.pluginGuideUrl}
                  external
                  className="font-medium"
                >
                  Plugin guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </ShimmerLinkButton>
                <ShimmerLinkButton
                  variant="outline"
                  href={`${site.repoUrl}/tree/main/packages/plugin-sdk`}
                  external
                  className="font-medium"
                >
                  Plugin SDK
                </ShimmerLinkButton>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold tracking-wider text-white/60 uppercase">
                A plugin implements
              </h3>
              <ul className="space-y-3">
                {responsibilities.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                    <span className="leading-6 text-white/80">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Built a plugin?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/70">
            Open a pull request — new site plugins are one of the most valuable
            contributions you can make.
          </p>
          <div className="mt-8">
            <ShimmerLinkButton
              size="lg"
              variant="outline"
              href={`${site.repoUrl}/blob/main/docs/PLUGIN_GUIDE.md`}
              external
              className="font-semibold"
            >
              Read the full guide
            </ShimmerLinkButton>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
