import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Github,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { Reveal } from "../components/shared/Reveal";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { site, type RoadmapStatus } from "../content/site";
import { fetchRoadmap, type RoadmapSource } from "../lib/roadmap";

const STATUS_STYLES: Record<
  RoadmapStatus,
  { icon: typeof Circle; badgeClass: string; lineClass: string }
> = {
  shipped: {
    icon: CheckCircle2,
    badgeClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    lineClass: "bg-emerald-400/40",
  },
  "in-progress": {
    icon: LoaderCircle,
    badgeClass: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    lineClass: "bg-amber-400/40",
  },
  planned: {
    icon: Circle,
    badgeClass: "border-white/20 bg-white/5 text-white/60",
    lineClass: "bg-white/15",
  },
};

function StatusBadge({ status }: { status: RoadmapStatus }) {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  const label =
    status === "shipped"
      ? "Shipped"
      : status === "in-progress"
        ? "In progress"
        : "Planned";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${style.badgeClass}`}
    >
      <Icon className={`h-3.5 w-3.5 ${status === "in-progress" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function RoadmapColumn({
  group,
  index,
}: {
  group: RoadmapSource["groups"][number];
  index: number;
}) {
  const style = STATUS_STYLES[group.status];
  return (
    <Reveal delay={index * 0.1} className="h-full">
      <div className="flex h-full flex-col">
        <div className="mb-5 flex items-center gap-3">
          <span className={`h-px w-8 ${style.lineClass}`} aria-hidden="true" />
          <StatusBadge status={group.status} />
        </div>
        <p className="text-sm leading-6 text-white/50">{group.description}</p>

        <ul className="mt-6 space-y-4">
          {group.items.length === 0 && (
            <li className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/40">
              Nothing here right now.
            </li>
          )}
          {group.items.map((item) => (
            <li
              key={item.title}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/20"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-white">{item.title}</h3>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-white/60">
                  {item.target}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/70">
                {item.description}
              </p>
              {item.issueUrl && (
                <a
                  href={item.issueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-white/60 transition-colors hover:text-white"
                >
                  <Github className="h-3.5 w-3.5" />
                  Track on GitHub
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

function SourceNote({ source }: { source: RoadmapSource }) {
  if (source.source === "fallback") {
    return (
      <p className="text-xs text-white/40">
        Showing the curated roadmap — live sync with GitHub Issues is
        unavailable right now.
      </p>
    );
  }
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-white/40">
      <a
        href={`${site.issuesUrl}?q=is%3Aissue+label%3Aroadmap`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/70"
      >
        <Github className="h-3.5 w-3.5" />
        Live from GitHub Issues labeled “roadmap”
      </a>
      {source.fetchedAt !== undefined &&
        ` · updated ${new Date(source.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
    </p>
  );
}

export default function RoadmapPage() {
  const [source, setSource] = useState<RoadmapSource | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = (bustCache: boolean): void => {
    if (bustCache) {
      try {
        window.sessionStorage.removeItem("rekordly-roadmap-cache");
      } catch {
        // ignore storage errors — refetch still works
      }
    }
    setRefreshing(true);
    void fetchRoadmap()
      .then((result) => setSource(result))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    load(false);
  }, []);

  const groups = source?.groups ?? [];
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Roadmap"
          title="How development is going"
          description="Everything Rekordly has shipped, what is being built right now, and what comes next — synced straight from GitHub Issues."
        />

        {source !== null && (
          <Reveal className="mx-auto mt-8 max-w-2xl">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/60">
              {groups.map((group) => (
                <span key={group.status} className="inline-flex items-center gap-2">
                  <StatusBadge status={group.status} />
                  <span className="tabular-nums">{group.items.length}</span>
                </span>
              ))}
              {totalItems > 0 && (
                <button
                  type="button"
                  onClick={() => load(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              )}
            </div>
            <div className="mt-4 text-center">
              <SourceNote source={source} />
            </div>
          </Reveal>
        )}
      </Section>

      <Section className="border-t border-white/10 pt-16">
        {source === null ? (
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-8">
            {[0, 1, 2].map((index) => (
              <div key={index} className="animate-pulse space-y-4">
                <div className="h-7 w-28 rounded-full bg-white/5" />
                <div className="h-20 rounded-xl bg-white/5" />
                <div className="h-32 rounded-xl bg-white/5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-8">
            {groups.map((group, index) => (
              <RoadmapColumn key={group.status} group={group} index={index} />
            ))}
          </div>
        )}
      </Section>

      <Section className="border-t border-white/10 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Want to influence what ships next?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">
            Feature ideas are discussed in the open — vote with a 👍 on any
            roadmap issue, or propose something new in Discussions.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <ShimmerLinkButton
              href={`${site.issuesUrl}?q=is%3Aissue+label%3Aroadmap`}
              external
              className="font-semibold shadow-lg shadow-white/10"
            >
              <Github className="mr-2 h-4 w-4" />
              View roadmap issues
            </ShimmerLinkButton>
            <ShimmerLinkButton variant="outline" href="/contact" className="font-medium">
              Report a bug
              <ArrowRight className="ml-2 h-4 w-4" />
            </ShimmerLinkButton>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
