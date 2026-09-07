import { useQuery } from '@tanstack/react-query';
import { Globe, Radio, Video, Music, FileDown } from 'lucide-react';
import { Badge, Card, Skeleton } from '@rekordly/ui';

interface SiteGroup {
  label: string;
  icon: typeof Video;
  sites: string[];
}

/**
 * Curated highlights of what the generic download engine supports. The engine
 * itself is powered by yt-dlp, which covers 1000+ additional sites — anything
 * not listed here usually works too.
 */
const GENERIC_GROUPS: SiteGroup[] = [
  {
    label: 'Video platforms',
    icon: Video,
    sites: ['YouTube', 'Vimeo', 'Twitter / X', 'TikTok', 'Instagram', 'Facebook', 'Reddit', 'Dailymotion', 'Bilibili', 'Twitch (VODs & clips)'],
  },
  {
    label: 'Audio & music',
    icon: Music,
    sites: ['SoundCloud', 'Bandcamp', 'Mixcloud', 'Audiomack', 'Direct MP3/M4A/FLAC/WAV links'],
  },
  {
    label: 'Direct files',
    icon: FileDown,
    sites: ['Any direct .mp4 / .mkv / .webm / .mov URL', 'Podcast feeds & CDN media', 'HLS (.m3u8) streams'],
  },
  {
    label: 'Adult platforms',
    icon: Video,
    sites: ['Pornhub', 'XVideos', 'xHamster', 'SpankBang', 'RedGifs', 'PornTrex', 'ThisVid', 'Motherless'],
  },
];

export function SupportedSitesContent() {
  const { data: plugins, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });

  const streamingPlugins = (plugins ?? []).filter((p) => p.enabled);

  return (
    <div className="flex flex-col gap-4">
      {/* Streaming platforms — dynamic from installed plugins */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Live streaming platforms</h3>
        </div>
        <p className="mt-1 text-xs text-foreground-muted">
          Live recording is powered by installed plugins. Each plugin adds its platform to this list.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isLoading && <Skeleton className="h-6 w-40" />}
          {!isLoading && streamingPlugins.length === 0 && (
            <p className="text-xs text-foreground-muted">No plugins enabled yet — install one from the Plugins page.</p>
          )}
          {streamingPlugins.map((plugin) => (
            <Badge key={plugin.id} variant="info">
              {plugin.name} v{plugin.version}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Generic download sites */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Generic downloads</h3>
        </div>
        <p className="mt-1 text-xs text-foreground-muted">
          The Downloads page accepts page URLs from these services as well as any direct media file link.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          {GENERIC_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.label}>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
                  <Icon size={12} /> {group.label}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.sites.map((site) => (
                    <Badge key={site} variant="muted">{site}</Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground">Even more sites</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground-muted">
          Generic downloads are powered by yt-dlp, which supports over a thousand additional websites.
          The full, always-up-to-date list lives at{' '}
          <code className="rounded-sm bg-elevated px-1 py-0.5 text-[11px]">github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md</code>.
          If a site works there, paste its URL into Add Download and it will work here too.
        </p>
      </Card>
    </div>
  );
}