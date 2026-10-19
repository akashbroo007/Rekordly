import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Boxes,
  Check,
  Download,
  FlaskConical,
  MonitorPlay,
  Puzzle,
  Search,
  Sparkles,
} from "lucide-react";
import { Reveal } from "../shared/Reveal";
import {
  capabilityLabels,
  plannedPlatforms,
  plugins,
  pluginFilters,
  sortForMarketplace,
  type PluginEntry,
  type PluginFilterId,
} from "../../content/plugins";

function matchesFilter(plugin: PluginEntry, filter: PluginFilterId): boolean {
  switch (filter) {
    case "all":
      return true;
    case "bundled":
      // Ships inside the installer — nothing to download.
      return plugin.bundled;
    case "marketplace":
      // Non-bundled plugins the user must download (zip) and install from the
      // app — the same condition that shows the card's Marketplace badge, so
      // the filter matches exactly the cards it describes. The mock example
      // plugin (bundled: false, no download) stays in "All" only.
      return !plugin.bundled && plugin.download !== undefined;
    case "recording":
      return plugin.permissions.includes("recording");
    case "vr":
      return plugin.streamTypes?.includes("vr") ?? false;
    case "downloads":
      return plugin.downloads ?? false;
  }
}

/**
 * Brand-tinted icon tile. Renders the plugin's real site icon (from
 * /public/plugins, mirroring the desktop app's per-site favicons) when the
 * entry has one; anything else — e.g. the mock platform — keeps the generic
 * puzzle glyph.
 */
const PLATFORM_TILE_COLORS: Record<string, string> = {
  twitch: "#9147ff",
  youtube: "#ff0033",
  rumble: "#0dbf43",
  kick: "#53fc18",
  // Tango's logo is a red→purple gradient swoosh; the tile tint reads on the
  // purple end so it doesn't collide with stripchat's rose.
  tango: "#d946ef",
  chaturbate: "#ff5c1f",
  stripchat: "#e7245e",
  bongacams: "#ff5a3c",
  cam4: "#fb923c",
  camsoda: "#f472b6",
  dreamcam: "#ff4d8d",
  jerkmate: "#e0455e",
  myfreecams: "#22d3ee",
  streamate: "#38bdf8",
};

function PluginIcon({ plugin }: { plugin: PluginEntry }) {
  const color = PLATFORM_TILE_COLORS[plugin.id] ?? "#8b93a1";
  if (!plugin.icon) {
    return (
      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
        <Puzzle className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]"
      style={{
        boxShadow: `inset 0 0 0 1px ${color}55`,
      }}
    >
      <img
        src={`/plugins/${plugin.icon}`}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        draggable={false}
        className="h-6 w-6 object-contain"
      />
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginEntry }) {
  return (
    <div className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-all hover:border-white/25 hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PluginIcon plugin={plugin} />
          <div>
            <h3 className="font-semibold text-white">{plugin.name}</h3>
            <p className="text-xs text-white/50">
              {plugin.domain ?? plugin.id} · v{plugin.version}
            </p>
          </div>
        </div>
        {plugin.bundled ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/80"
            title="Ships bundled with the Rekordly installer"
          >
            <BadgeCheck className="h-3 w-3" aria-hidden="true" />
            Bundled
          </span>
        ) : plugin.download ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/80"
            title="Install via the plugin marketplace zip"
            aria-label="Marketplace plugin"
          >
            <Puzzle className="h-3 w-3" aria-hidden="true" />
            Marketplace
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60">
            <FlaskConical className="h-3 w-3" aria-hidden="true" />
            Example
          </span>
        )}
      </div>

      <p className="mt-4 flex-1 text-sm leading-6 text-white/70">
        {plugin.description}
      </p>

      {plugin.setupHint && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/60">
          {plugin.setupHint}
        </p>
      )}

      {plugin.download && (
        <a
          href={plugin.download}
          download
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/35 hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download zip (v{plugin.version})
          <span className="text-white/40">· marketplace</span>
        </a>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {plugin.capabilities.map((capability) => (
          <span
            key={capability}
            className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-white/60"
          >
            {capabilityLabels[capability]}
          </span>
        ))}
        {plugin.streamTypes?.includes("vr") && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-0.5 text-[11px] font-medium text-white">
            <Boxes className="h-3 w-3" aria-hidden="true" />
            VR (3D)
          </span>
        )}
      </div>
    </div>
  );
}

function PluginGrid({ items }: { items: PluginEntry[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((plugin, index) => (
        <Reveal key={plugin.id} delay={(index % 3) * 0.06} className="h-full">
          <PluginCard plugin={plugin} />
        </Reveal>
      ))}
    </div>
  );
}

export function PluginMarketplace() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PluginFilterId>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = plugins.filter((plugin) => {
      if (!matchesFilter(plugin, filter)) return false;
      if (!q) return true;
      return (
        plugin.name.toLowerCase().includes(q) ||
        plugin.id.toLowerCase().includes(q) ||
        plugin.description.toLowerCase().includes(q)
      );
    });
    // Generic platform plugins first, cam sites after.
    return sortForMarketplace(filtered);
  }, [query, filter]);

  const platformPlugins = visible.filter((p) => p.category === "platform");
  const camPlugins = visible.filter((p) => p.category === "cam");
  const isFiltering = query.trim().length > 0 || filter !== "all";

  return (
    <div>
      {/* Search + filters */}
      <Reveal className="mx-auto max-w-2xl">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plugins…"
            aria-label="Search plugins"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {pluginFilters.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              title={
                option.id === "bundled"
                  ? "Ships bundled with the Rekordly installer"
                  : option.id === "marketplace"
                    ? "Not included in the installer — download the zip and install it from the app"
                    : undefined
              }
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === option.id
                  ? "border-white/30 bg-white/10 text-white"
                  : "border-white/10 bg-transparent text-white/60 hover:border-white/20 hover:text-white"
              }`}
            >
              {option.id === "bundled" && (
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {(option.id === "marketplace" || option.id === "downloads") && (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {option.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Grouped grid: generic platforms first, cam sites after */}
      {visible.length > 0 ? (
        <>
          {platformPlugins.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <MonitorPlay
                  className="h-4 w-4 text-white/60"
                  aria-hidden="true"
                />
                <h3 className="text-sm font-semibold tracking-wider text-white/60 uppercase">
                  Streaming platforms
                </h3>
                <span className="text-xs text-white/40">
                  · Twitch, YouTube & more
                </span>
              </div>
              <PluginGrid items={platformPlugins} />
            </div>
          )}

          {camPlugins.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-white/60" aria-hidden="true" />
                <h3 className="text-sm font-semibold tracking-wider text-white/60 uppercase">
                  Cam sites
                </h3>
                <span className="text-xs text-white/40">
                  · live-cam platforms
                </span>
              </div>
              <PluginGrid items={camPlugins} />
            </div>
          )}
        </>
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center">
          <Boxes className="mx-auto h-8 w-8 text-white/30" aria-hidden="true" />
          <p className="mt-4 text-sm text-white/70">
            No plugins match your search.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            className="mt-3 text-sm font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Planned generic platforms — only in the unfiltered default view */}
      {!isFiltering && (
        <Reveal className="mt-10">
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <Sparkles
                className="h-4 w-4 text-white/60"
                aria-hidden="true"
              />
              <h3 className="text-sm font-semibold tracking-wider text-white/60 uppercase">
                Streaming platforms coming soon
              </h3>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Generic live-streaming platform plugins on the roadmap — built on
              the same SDK. Missing one?{" "}
              <a
                href="#request-plugin"
                className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
              >
                Request it below
              </a>
              .
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {plannedPlatforms.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* Count */}
      <p className="mt-8 text-center text-xs text-white/40">
        {visible.length} of {plugins.length} plugins
      </p>
    </div>
  );
}

/** Compact "what's inside a plugin" strip reused on the marketplace page. */
export function PluginCapabilityLegend() {
  const points = [
    "Every plugin declares its capabilities up front",
    "Capability detection adapts the UI to what a site can do",
    "Health checks keep site redesigns isolated and visible",
  ];
  return (
    <ul className="space-y-3">
      {points.map((point) => (
        <li key={point} className="flex items-start gap-3 text-sm">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-white/60"
            aria-hidden="true"
          />
          <span className="leading-6 text-white/80">{point}</span>
        </li>
      ))}
    </ul>
  );
}
