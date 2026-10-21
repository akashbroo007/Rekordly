import { platforms } from "../../content/site";
import { plugins } from "../../content/plugins";
import { PLATFORM_TILE_COLORS } from "../plugins/PluginMarketplace";

/**
 * Single horizontal row of every supported site — real site icon (the same
 * assets the marketplace cards use) plus the site name, wrapping on narrow
 * screens. Static by design: no marquee/carousel animation.
 */
export function PlatformStrip() {
  const siteByIcon = new Map(
    plugins
      .filter((plugin) => plugin.icon)
      .map((plugin) => [
        plugin.name,
        { icon: plugin.icon as string, brand: PLATFORM_TILE_COLORS[plugin.id] },
      ]),
  );

  return (
    <ul
      role="list"
      className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2.5 sm:gap-3"
    >
      {platforms.map((platform) => {
        const icon = siteByIcon.get(platform.name);
        return (
          <li
            key={platform.name}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] py-1.5 pl-1.5 pr-3.5"
          >
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04]"
              style={{
                boxShadow: icon ? `inset 0 0 0 1px ${icon.brand}55` : undefined,
              }}
            >
              {icon ? (
                <img
                  src={`/plugins/${icon.icon}`}
                  alt=""
                  width={24}
                  height={24}
                  loading="lazy"
                  draggable={false}
                  className="h-3.5 w-3.5 object-contain"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="text-[10px] font-semibold text-white"
                >
                  {platform.name.charAt(0)}
                </span>
              )}
            </span>
            <span className="text-sm text-white/80">{platform.name}</span>
          </li>
        );
      })}
    </ul>
  );
}
