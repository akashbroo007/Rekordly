import { Link } from "react-router-dom";
import { ArrowRight, Github, Plug } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import {
  PluginCapabilityLegend,
  PluginMarketplace,
} from "../components/plugins/PluginMarketplace";
import { PluginRequest } from "../components/plugins/PluginRequest";
import { plugins } from "../content/plugins";
import { site } from "../content/site";
import { useSeo } from "../lib/seo";

export default function MarketplacePage() {
  useSeo({
    title:
      "Plugin Marketplace — streaming platform & site plugins for Rekordly",
    description:
      "Browse 14 ready-to-install plugins: Twitch, YouTube, Rumble, Kick, Tango Live, and 9 live-cam sites — or request support for a new streaming platform.",
    path: "/marketplace",
  });

  const shippable = plugins.filter((plugin) => !plugin.developer);
  const platformCount = shippable.filter(
    (plugin) => plugin.category === "platform",
  ).length;
  const totalCount = shippable.length;

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Plugin Marketplace"
          as="h1"
          title="Recording technology for any streaming platform"
          description={`Rekordly is platform-agnostic live-stream recording and monitoring software. ${totalCount} plugins ship today — ${platformCount} generic streaming platforms plus a growing catalog of live-cam sites — and new platforms are on the way.`}
        />

        <div className="mt-12">
          <PluginMarketplace />
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-6 text-white/60">
          Looking for a recorder for live-cam platforms? See{" "}
          <Link
            to="/adult-stream-recording"
            className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
          >
            Adult Live Stream Recording
          </Link>
          {" "}— the same Rekordly app, covering that use case.
        </p>
      </Section>

      <Section className="border-y border-white/10 bg-[#050505]">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="mb-3 text-sm font-semibold tracking-wide text-white/60 uppercase">
                Build it yourself
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Can't wait? Write the plugin.
              </h2>
              <p className="mt-4 text-lg leading-7 text-white/70">
                The plugin SDK is a small, typed public API. Implement a few
                responsibilities, and every Rekordly user can track your
                platform — community plugins are one of the most valuable
                contributions you can make.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <ShimmerLinkButton
                  href={site.pluginGuideUrl}
                  external
                  className="font-medium"
                >
                  <Github className="mr-2 h-4 w-4" />
                  Plugin guide
                </ShimmerLinkButton>
                <ShimmerLinkButton
                  variant="outline"
                  href="/plugins"
                  className="font-medium"
                >
                  <Plug className="mr-2 h-4 w-4" />
                  How the plugin system works
                  <ArrowRight className="ml-2 h-4 w-4" />
                </ShimmerLinkButton>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold tracking-wider text-white/60 uppercase">
                Under the hood
              </h3>
              <PluginCapabilityLegend />
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="request-plugin">
        <SectionHeading
          eyebrow="Missing a platform?"
          title="Request a plugin"
          description="Tell us which streaming platform you want supported. Requests with the most demand get built first."
        />
        <div className="mt-12">
          <PluginRequest />
        </div>
      </Section>
    </>
  );
}
