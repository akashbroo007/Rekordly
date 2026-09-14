import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, Check, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Input, Badge, Select } from '@rekordly/ui';
import type { AppSettings, UploadProviderMetaDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../../stores/toast-store';

export function CloudStorageSettings({
  draft,
  patch,
}: {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: providers } = useQuery({
    queryKey: ['upload-providers'],
    queryFn: () => window.desktop.uploads.providers(),
  });

  const { data: meta } = useQuery({
    queryKey: ['upload-providers-meta'],
    queryFn: () => window.desktop.uploads.providersMeta(),
  });

  // ponytail: Google Drive needs the OAuth loop to mint the refresh token —
  // the browser flow runs in the main process and persists all credentials
  // (including the refresh token) on success.
  const connectGoogleDrive = useMutation({
    mutationFn: (creds: { clientId: string; clientSecret: string }) =>
      window.desktop.uploads.connectGoogleDrive(creds.clientId, creds.clientSecret),
    onSuccess: (result, creds) => {
      void queryClient.invalidateQueries({ queryKey: ['upload-providers'] });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (result.ok) {
        // keep the draft in lockstep with the saved settings — otherwise the
        // next "Save changes" would wipe the refresh token the flow stored.
        const current = draft.uploadProviders;
        patch({
          uploadProviders: {
            ...current,
            'google-drive': {
              ...current['google-drive'],
              enabled: true,
              clientId: creds.clientId,
              clientSecret: creds.clientSecret,
            },
          } as typeof current,
        });
        pushToast({
          level: 'info',
          title: 'Google Drive connected',
          message: 'Account linked — Google Drive is ready to use.',
        });
      } else {
        pushToast({
          level: 'error',
          title: 'Could not connect Google Drive',
          message: result.error ?? 'Check your Client ID and Client Secret, then try again.',
        });
      }
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Could not connect Google Drive',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const providerStatus = new Map(providers?.map((p) => [p.id, p]) ?? []);
  const uploadProviders = draft.uploadProviders;

  const updateProvider = (id: string, updates: Record<string, unknown>) => {
    const current = uploadProviders;
    const existing = (current as unknown as Record<string, unknown>)[id] as Record<string, unknown> | undefined;
    patch({
      uploadProviders: {
        ...current,
        [id]: { ...existing, ...updates },
      } as typeof current,
    });
  };

  const formatMaxSize = (bytes: number | null): string => {
    if (bytes === null) return 'Unlimited';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${bytes} B`;
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-foreground-muted">
        Configure cloud storage providers for uploading recordings. Providers marked as available
        work out of the box; others require API credentials.
      </p>

      <div className="w-64">
        <Select
          label="Concurrent uploads"
          options={[1, 2, 3, 4, 5].map((n) => ({
            value: String(n),
            label: n === 1 ? '1 upload at a time' : `${n} uploads at a time`,
          }))}
          value={String(draft.maxConcurrentUploads ?? 1)}
          onChange={(e) => patch({ maxConcurrentUploads: Number(e.target.value) })}
          hint="How many files upload simultaneously. Low-Resource Mode keeps this at 1."
        />
      </div>

      {meta?.map((m) => {
        const status = providerStatus.get(m.id);
        const isDefault = uploadProviders.defaultProvider === m.id;
        const providerConfig = (uploadProviders as unknown as Record<string, Record<string, unknown>>)[m.id] ?? {};
        const isEnabled = providerConfig['enabled'] !== false;

        return (
          <ProviderCard
            key={m.id}
            meta={m}
            status={status}
            isDefault={isDefault}
            isEnabled={isEnabled}
            config={providerConfig}
            onConfigChange={(updates) => updateProvider(m.id, updates)}
            onConnectGoogleDrive={
              m.id === 'google-drive'
                ? () => {
                    const clientId = String(providerConfig['clientId'] ?? '').trim();
                    const clientSecret = String(providerConfig['clientSecret'] ?? '').trim();
                    if (clientId.length === 0 || clientSecret.length === 0) {
                      pushToast({
                        level: 'error',
                        title: 'Missing Google Drive credentials',
                        message: 'Paste your OAuth Client ID and Client Secret first.',
                      });
                      return;
                    }
                    connectGoogleDrive.mutate({ clientId, clientSecret });
                  }
                : undefined
            }
            connectPending={m.id === 'google-drive' && connectGoogleDrive.isPending}
            onSetDefault={() => patch({ uploadProviders: { ...uploadProviders, defaultProvider: m.id } })}
            formatMaxSize={formatMaxSize}
            expanded={expandedId === m.id}
            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
          />
        );
      })}
    </div>
  );
}

function ProviderCard({
  meta,
  status,
  isDefault,
  isEnabled,
  config,
  onConfigChange,
  onConnectGoogleDrive,
  connectPending,
  onSetDefault,
  formatMaxSize,
  expanded,
  onToggle,
}: {
  meta: UploadProviderMetaDto;
  status?: { authenticated: boolean; healthy: boolean };
  isDefault: boolean;
  isEnabled: boolean;
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
  onConnectGoogleDrive?: () => void;
  connectPending: boolean;
  onSetDefault: () => void;
  formatMaxSize: (bytes: number | null) => string;
  expanded: boolean;
  onToggle: () => void;
}) {

  // ponytail: distinguish "credentials pasted but Google account not linked
  // yet" from "nothing configured at all" — the old single "Not registered"
  // state made a completed credential setup look broken.
  const credsPasted =
    String(config['clientId'] ?? '').length > 0 && String(config['clientSecret'] ?? '').length > 0;
  const unregistered = !status && (meta.id !== 'google-drive' || !credsPasted);

  const statusColor = !status
    ? unregistered
      ? 'error'
      : 'warning'
    : status.authenticated && status.healthy
      ? 'success'
      : status.authenticated
        ? 'warning'
        : 'error';

  const statusText = !status
    ? unregistered
      ? 'Not registered'
      : 'Needs sign-in'
    : status.authenticated && status.healthy
      ? 'Online'
      : status.authenticated
        ? 'Registered (offline)'
        : 'Auth failed';

  return (
    <div className={`rounded-sm border ${isDefault ? 'border-primary/40' : 'border-border'} bg-surface`}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-sm ${isDefault ? 'bg-primary/15' : 'bg-elevated'}`}>
            <Cloud size={16} className={isDefault ? 'text-primary' : 'text-foreground-muted'} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{meta.name}</p>
              {isDefault && (
                <Badge variant="success">Default</Badge>
              )}
              <Badge variant={statusColor as 'success' | 'error' | 'warning' | 'muted'}>
                {statusText}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-foreground-muted">{meta.description}</p>
            {!status && meta.id === 'google-drive' && credsPasted && (
              <p className="mt-1 text-[11px] text-warning">
                Credentials saved — click "Connect Google Account" to link your Google account.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onToggle}
          className="shrink-0 rounded-sm p-1 text-foreground-muted transition-colors hover:bg-elevated hover:text-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
          <div>
            <span className="text-foreground-muted">Max file:</span>{' '}
            <span className="font-medium text-foreground">{formatMaxSize(meta.maxFileSize)}</span>
          </div>
          <div>
            <span className="text-foreground-muted">Storage:</span>{' '}
            <span className="font-medium text-foreground">{meta.storageQuota}</span>
          </div>
          <div>
            <span className="text-foreground-muted">Speed:</span>{' '}
            <span className={`font-medium ${meta.downloadSpeed === 'unthrottled' ? 'text-success' : 'text-warning'}`}>
              {meta.downloadSpeed}
            </span>
          </div>
          <div>
            <span className="text-foreground-muted">Expiry:</span>{' '}
            <span className="font-medium text-foreground">{meta.fileExpiry}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-success">Pros</p>
              <ul className="space-y-1">
                {meta.pros.map((pro, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground-muted">
                    <Check size={12} className="mt-0.5 shrink-0 text-success" />
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-error">Cons</p>
              <ul className="space-y-1">
                {meta.cons.map((con, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground-muted">
                    <X size={12} className="mt-0.5 shrink-0 text-error" />
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {meta.setupInstructions.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">Setup</p>
              <ol className="space-y-1">
                {meta.setupInstructions.map((step, i) => (
                  <li key={i} className="text-xs text-foreground-muted">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {meta.id === 'mixdrop' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                label="API Email"
                placeholder="your@email.com"
                value={(config['email'] as string) ?? ''}
                onChange={(e) => onConfigChange({ email: e.target.value, enabled: true })}
              />
              <Input
                label="API Key"
                placeholder="Your MixDrop API key"
                type="password"
                value={(config['apiKey'] as string) ?? ''}
                onChange={(e) => onConfigChange({ apiKey: e.target.value, enabled: true })}
              />
            </div>
          )}

          {meta.id === 'google-drive' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                label="Client ID"
                placeholder="xxxx.apps.googleusercontent.com"
                value={(config['clientId'] as string) ?? ''}
                onChange={(e) => onConfigChange({ clientId: e.target.value, enabled: true })}
              />
              <Input
                label="Client Secret"
                placeholder="Your OAuth client secret"
                type="password"
                value={(config['clientSecret'] as string) ?? ''}
                onChange={(e) => onConfigChange({ clientSecret: e.target.value, enabled: true })}
              />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            {!isDefault && (
              <Button variant="secondary" size="sm" onClick={onSetDefault}>
                Set as Default
              </Button>
            )}
            {meta.id === 'google-drive' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onConnectGoogleDrive}
                disabled={connectPending}
              >
                {connectPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Connect Google Account
              </Button>
            )}
          </div>
          {meta.id === 'google-drive' && (
            <p className="mt-2 text-[11px] text-foreground-muted">
              After pasting the Client ID and Client Secret, click Connect Google Account — a browser
              window opens to approve access (scope: per-file Drive access only). The connection is
              verified automatically once you return.
            </p>
          )}
          {meta.id === 'google-drive' && (
            <p className="mt-1 text-[11px] text-warning">
              Unverified app? Google only lets approved testers sign in while the consent screen is in
              Testing mode — add your Google account under "APIs & Services → OAuth consent screen →
              Audience → Test users" in Google Cloud Console, then connect again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
