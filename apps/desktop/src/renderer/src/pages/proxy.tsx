import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, RefreshCw, Shield, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, PageContainer, SectionHeader, Switch } from '@rekordly/ui';
import type { CreatorDto, MonitoringJobDto, ProxyStatusDto } from '@rekordly/shared/contracts';

/**
 * Secure Proxy page — visibility surface for the embedded proxy (Tor).
 * The CONTROL lives elsewhere (per-creator "Use secure proxy" toggle in the
 * Add/Edit dialogs); this page explains, shows live status, lets the user
 * flip per-creator flags in bulk, and recovers from failures.
 */

const STATUS_VARIANTS: Record<ProxyStatusDto['state'], 'success' | 'info' | 'error' | 'muted'> = {
  idle: 'muted',
  downloading: 'info',
  connecting: 'info',
  active: 'success',
  error: 'error',
};

const STATUS_LABELS: Record<ProxyStatusDto['state'], string> = {
  idle: 'Standing by',
  downloading: 'Downloading runtime…',
  connecting: 'Connecting…',
  active: 'Active',
  error: 'Error',
};

/** Join proxied creators with their monitoring jobs (live badges). */
function useProxiedCreators() {
  const creators = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
  });
  const jobs = useQuery({
    queryKey: ['monitoring-jobs'],
    queryFn: () => window.desktop.monitoring.getJobs(),
  });
  const plugins = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });

  const proxied = (creators.data ?? []).filter((c) => c.useProxy);
  const liveIds = new Set(
    (jobs.data ?? [])
      .filter((job: MonitoringJobDto) => job.state === 'live')
      .map((job) => job.creatorId),
  );
  const pluginNames = new Map((plugins.data ?? []).map((p) => [p.id, p.name]));

  return {
    isLoading: creators.isLoading || jobs.isLoading,
    proxied,
    isLive: (creator: CreatorDto): boolean =>
      liveIds.has(`${creator.pluginId}:${creator.externalId}`),
    pluginName: (creator: CreatorDto): string =>
      pluginNames.get(creator.pluginId) ?? creator.pluginId,
  };
}

export function ProxyPage() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['proxy-status'],
    queryFn: () => window.desktop.proxy.getStatus(),
  });
  const { data: networkMode } = useQuery({
    queryKey: ['proxy-network-mode'],
    queryFn: () => window.desktop.proxy.getNetworkMode(),
  });
  const { isLoading, proxied, isLive, pluginName } = useProxiedCreators();

  // ponytail: push channel keeps the pill live without polling.
  const [pushStatus, setPushStatus] = useState<ProxyStatusDto | null>(null);
  useEffect(
    () => window.desktop.proxy.onEvent((s) => setPushStatus(s)),
    [],
  );

  const effective: ProxyStatusDto = pushStatus ?? status ?? { state: 'idle' };

  const start = useMutation({
    mutationFn: () => window.desktop.proxy.start(),
  });

  const test = useMutation({
    mutationFn: () => window.desktop.proxy.test(),
    onSuccess: () => {
      // status may have transitioned during the probe
      void queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      window.desktop.creators.setUseProxy(id, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
    },
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Secure Proxy"
        description="Embedded secure route for creators whose site is blocked on your network."
      />

      <div className="space-y-4">
        {/* Status banner */}
        <Card className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-start gap-3">
            {effective.state === 'active' ? (
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-success" />
            ) : effective.state === 'error' ? (
              <ShieldAlert size={20} className="mt-0.5 shrink-0 text-error" />
            ) : effective.state === 'idle' ? (
              <ShieldOff size={20} className="mt-0.5 shrink-0 text-foreground-muted" />
            ) : (
              <Shield size={20} className="mt-0.5 shrink-0 animate-pulse text-info" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANTS[effective.state]}>{STATUS_LABELS[effective.state]}</Badge>
              </div>
              <p className="mt-1.5 text-xs text-foreground-muted">
                {effective.state === 'active'
                  ? test.isSuccess
                    ? `Verified through the secure route — exit node ${test.data.ip} · ${test.data.latencyMs} ms`
                    : 'Proxy traffic is flowing. Use "Test connection" to verify the route.'
                  : effective.state === 'idle'
                    ? 'Standing by — the proxy starts automatically when one of your proxied creators is checked.'
                    : effective.state === 'error'
                      ? (effective.message ?? 'The proxy failed to start.')
                      : (effective.message ?? 'Setting up the secure route…')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {effective.state === 'active' && (
              <Button
                variant="ghost"
                size="sm"
                loading={test.isPending}
                onClick={() => test.mutate()}
              >
                <Globe size={14} /> Test connection
              </Button>
            )}
            {/* ponytail: manual start — previously the ONLY control (Retry)
                appeared on error, so a standing-by proxy had no controls at
                all. Pre-starting also lets "Test connection" be used before
                any creator check triggers the automatic start. */}
            {effective.state === 'idle' && (
              <Button variant="secondary" size="sm" loading={start.isPending} onClick={() => start.mutate()}>
                <RefreshCw size={14} /> Start proxy
              </Button>
            )}
            {effective.state === 'error' && (
              <Button variant="secondary" size="sm" loading={start.isPending} onClick={() => start.mutate()}>
                <RefreshCw size={14} /> Retry
              </Button>
            )}
          </div>
        </Card>

        {/* Proxied creators */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Proxied creators</h2>
            {proxied.length > 0 && <Badge variant="muted">{proxied.length}</Badge>}
          </div>
          {isLoading ? (
            <p className="mt-3 text-xs text-foreground-muted">Loading creators…</p>
          ) : proxied.length === 0 ? (
            <p className="mt-3 text-xs text-foreground-muted">
              No creators are using the proxy right now. Enable "Use secure proxy" on a
              creator (Creators page → Add/Edit) to route their traffic through it.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {proxied.map((creator) => (
                <li key={creator.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="truncate">{creator.displayName}</span>
                      {isLive(creator) && <Badge variant="success">Live</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {pluginName(creator)} · {creator.username}
                    </p>
                  </div>
                  <Switch
                    checked={creator.useProxy}
                    onCheckedChange={(enabled) => toggle.mutate({ id: creator.id, enabled })}
                    aria-label={`Use secure proxy for ${creator.displayName}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ponytail: system VPN (e.g. WARP) detected → positive highlight.
            The direct route is fast and the embedded proxy stays on standby
            as backup, so this state is framed as good news, not a pitch. */}
        {networkMode?.systemVpnDetected === true ? (
          <Card className="border-success/40 bg-success/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <ShieldCheck size={14} className="text-success" /> Full speed available
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                  {networkMode.product ?? 'A system VPN'} is active on this PC. Blocked sites are
                  reachable directly at full recording speed, so the built-in proxy stays on standby
                  and only starts if a direct check fails. Nothing to do — you are all set.
                </p>
              </div>
              <Badge variant="success">Full speed</Badge>
            </div>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Globe size={14} className="text-info" /> Want full speed?
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                  The built-in secure proxy works everywhere but routes through the Tor network,
                  which is slower. For full recording speed, install{' '}
                  <span className="font-medium text-foreground">Cloudflare WARP</span> (free, made by
                  Cloudflare) on this PC. Rekordly picks it up automatically — no settings, no
                  changes — and the built-in proxy stays on standby as backup.
                </p>
                <a
                  href="https://one.one.one.one/"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-info hover:underline"
                >
                  Get Cloudflare WARP →
                </a>
              </div>
            </div>
          </Card>
        )}

        {/* Footnote — one-time education */}
        <p className="text-xs leading-relaxed text-foreground-muted">
          How this works: plugin traffic and recordings for flagged creators route through an
          embedded secure proxy. Your other traffic is never touched. The proxy runtime downloads
          automatically on first use and starts only when a proxied creator is being checked —
          expect slightly slower checks and recordings through the secure route.
        </p>
      </div>
    </PageContainer>
  );
}
