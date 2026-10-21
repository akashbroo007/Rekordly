/**
 * Plugin page dialogs — settings, diagnostics and the red remove-confirm.
 * The settings and diagnostics logic (queries, IPC calls, toasts and
 * invalidation) is the exact code from the previous page, now controlled
 * by the page instead of per-card mounting so only one is ever open.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Info, Trash2 } from 'lucide-react';
import type { PluginInfoDto, SettingDefDto } from '@rekordly/shared/contracts';
import { Button, Dialog, DialogContent, Input, Select, Switch } from '@rekordly/ui';
import { useToastStore } from '../../stores/toast-store';

/** DetailRow — normal-case, minimum 12px (WCAG AA) labels. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-xs font-medium text-foreground-muted">{label}</dt>
      <dd className="max-w-[60%] truncate text-right text-xs tabular-nums text-foreground-secondary" title={value}>
        {value}
      </dd>
    </div>
  );
}

/* --- Settings ---------------------------------------------------------------- */

export function PluginSettingsDialog({
  plugin,
  open,
  onOpenChange,
}: {
  plugin: PluginInfoDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();
  const id = plugin?.id ?? null;

  // Existing queries — identical keys/IDs as the old per-card dialog.
  const { data: schema } = useQuery({
    queryKey: ['plugin-settings-schema', id],
    queryFn: () => window.desktop.plugins.getSettingsSchema(id!),
    enabled: open && id !== null,
  });

  const { data: values } = useQuery({
    queryKey: ['plugin-settings', id],
    queryFn: () => window.desktop.plugins.getSettings(id!),
    enabled: open && id !== null,
  });

  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});

  useEffect(() => {
    if (values !== undefined) {
      // ponytail: values are validated primitives; direct cast is fine here
      setDraft(values as Record<string, string | number | boolean>);
    }
  }, [values]);

  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) => window.desktop.plugins.setSettings(id!, next),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: 'Settings saved',
        message: `${plugin?.name ?? 'Plugin'} settings updated.`,
      });
      // ponytail: cache-only refresh — Needs-setup re-derives when the
      // plugin list refetches (the probe effect keys off it). No IPC or
      // logic change vs the old page's invalidation.
      void queryClient.invalidateQueries({ queryKey: ['plugin-settings', id] });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Failed to save settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const hasSettings = (schema?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`${plugin?.name ?? 'Plugin'} settings`}
        description="Platform-specific configuration."
      >
        {!hasSettings ? (
          <p className="text-sm text-foreground-muted">This plugin does not expose settings.</p>
        ) : (
          <div className="space-y-4">
            {(schema ?? []).map((def) => (
              <SettingField
                key={def.key}
                def={def}
                value={draft[def.key]}
                onChange={(value) => setDraft((prev) => ({ ...prev, [def.key]: value }))}
              />
            ))}
            <Button loading={save.isPending} onClick={() => save.mutate(draft)} className="w-full">
              Save settings
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingField({
  def,
  value,
  onChange,
}: {
  def: SettingDefDto;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  if (def.type === 'guide') {
    return (
      <div className="rounded-sm border border-border bg-elevated px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
          <Info size={12} className="text-info" />
          {def.label}
        </p>
        {def.description !== undefined && (
          <p className="mt-1 text-xs leading-relaxed text-foreground-secondary">{def.description}</p>
        )}
        {(def.steps?.length ?? 0) > 0 && (
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-foreground-secondary">
            {def.steps?.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  if (def.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{def.label}</p>
          {def.description !== undefined && <p className="mt-0.5 text-xs text-foreground-muted">{def.description}</p>}
        </div>
        <Switch checked={value === true} onCheckedChange={onChange} aria-label={def.label} />
      </div>
    );
  }

  if (def.type === 'select' && def.options !== undefined) {
    return (
      <Select
        label={def.label}
        hint={def.description}
        value={String(value ?? def.defaultValue ?? '')}
        onChange={onChange}
        options={def.options.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
    );
  }

  return (
    <Input
      label={def.label}
      hint={def.description}
      type={def.type === 'number' ? 'number' : def.type === 'password' ? 'password' : 'text'}
      value={
        value === undefined ? ((def.defaultValue as string | number | undefined) ?? '') : String(value)
      }
      onChange={(event) => {
        const raw = event.target.value;
        onChange(def.type === 'number' ? Number(raw) : raw);
      }}
    />
  );
}

/* --- Diagnostics ---------------------------------------------------------------- */

export function PluginDiagnosticsDialog({
  plugin,
  open,
  onOpenChange,
}: {
  plugin: PluginInfoDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const id = plugin?.id ?? null;

  const health = useMutation({
    mutationFn: () => window.desktop.plugins.getHealth(id!),
    onSuccess: (result) => {
      pushToast({
        level: result.healthy ? 'info' : 'warn',
        title: `${plugin?.name ?? 'Plugin'} health: ${result.healthy ? 'healthy' : 'unhealthy'}`,
        message: result.message ?? (result.healthy ? 'All systems nominal.' : 'Health check failed.'),
      });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Diagnostics · ${plugin?.name ?? 'Plugin'}`}
        description={plugin !== null ? `v${plugin.version}` : undefined}
      >
        <div className="divide-y divide-border text-sm">
          {plugin !== null && <DetailRow label="State" value={plugin.state} />}
          <DetailRow label="Last health check" value={plugin?.health?.checkedAt ?? '—'} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" loading={health.isPending} onClick={() => health.mutate()}>
            <Activity size={14} />
            Run health check
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --- Remove confirm --------------------------------------------------------------- */

/**
 * Red confirm naming the plugin AND how many creators use it — Remove is
 * destructive (the plugin folder is deleted and its creators stop
 * monitoring), so it lives behind this dialog, styled error-red.
 */
export function PluginRemoveDialog({
  plugin,
  creatorsUsing,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  plugin: PluginInfoDto | null;
  creatorsUsing: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={plugin !== null ? `Remove ${plugin.name}?` : 'Remove plugin?'}
        description={
          plugin !== null
            ? `${creatorsUsing === 1 ? '1 creator is' : `${creatorsUsing} creators are`} monitored through this plugin.`
            : undefined
        }
      >
        <p className="text-sm font-medium text-error">
          Removing it deletes the plugin folder and stops monitoring and recordings for those creators.
        </p>
        <p className="mt-1 text-xs text-foreground-secondary">
          Creator accounts and recordings already on disk are not deleted.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            <Trash2 size={14} /> Remove {plugin?.name ?? 'plugin'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
