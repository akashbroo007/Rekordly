import { useMutation, useQuery } from '@tanstack/react-query';
import { Cloud, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Button, Input, Badge } from '@rekordly/ui';
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: providers } = useQuery({
    queryKey: ['upload-providers'],
    queryFn: () => window.desktop.uploads.providers(),
  });

  const { data: meta } = useQuery({
    queryKey: ['upload-providers-meta'],
    queryFn: () => window.desktop.uploads.providersMeta(),
  });

  const testProvider = useMutation({
    mutationFn: (id: string) => window.desktop.uploads.testProvider(id),
    onSuccess: (result, id) => {
      pushToast({
        level: result ? 'info' : 'error',
        title: result ? 'Connection successful' : 'Connection failed',
        message: result
          ? `${id} is reachable and authenticated.`
          : `Could not connect to ${id}. Check your credentials.`,
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
            onTest={() => testProvider.mutate(m.id)}
            onSetDefault={() => patch({ uploadProviders: { ...uploadProviders, defaultProvider: m.id } })}
            testPending={testProvider.isPending}
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
  onTest,
  onSetDefault,
  testPending,
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
  onTest: () => void;
  onSetDefault: () => void;
  testPending: boolean;
  formatMaxSize: (bytes: number | null) => string;
  expanded: boolean;
  onToggle: () => void;
}) {

  const statusColor = !status
    ? 'muted'
    : status.authenticated && status.healthy
      ? 'success'
      : status.authenticated
        ? 'warning'
        : 'error';

  const statusText = !status
    ? 'Not registered'
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
            {meta.requiresApiKey && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onTest}
                disabled={testPending}
              >
                {testPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Test Connection
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
