import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BadgeCheck, ExternalLink, KeyRound, ShieldX } from 'lucide-react';
import { Button, Input, SectionHeader } from '@rekordly/ui';
import type { LicenseStatusDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../../stores/toast-store';

const BUY_URL = 'https://rekordly.in/#pricing';

function tierLabel(status: LicenseStatusDto): { text: string; tone: 'pro' | 'warn' | 'muted' } {
  if (status.tier === 'pro') return { text: 'Pro — lifetime', tone: 'pro' };
  if (status.tier === 'trial') {
    const days = status.trialDaysLeft ?? 0;
    return { text: `Trial — ${days} ${days === 1 ? 'day' : 'days'} left`, tone: 'pro' };
  }
  if (status.expired) return { text: 'Trial expired', tone: 'warn' };
  return { text: 'Free tier', tone: 'muted' };
}

function limitText(value: number | null): string {
  return value === null ? 'Unlimited' : String(value);
}

export function LicenseSettings() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [keyInput, setKeyInput] = useState('');

  const { data: status } = useQuery({
    queryKey: ['license-status'],
    queryFn: () => window.desktop.license.getStatus(),
  });

  const activate = useMutation({
    mutationFn: (key: string) => window.desktop.license.activate(key),
    onSuccess: (result) => {
      if (result.ok) {
        pushToast({
          level: 'info',
          title: 'License activated',
          message: 'Thank you for supporting Rekordly — all Pro limits are removed.',
        });
        setKeyInput('');
      } else {
        pushToast({
          level: 'error',
          title: 'Activation failed',
          message: result.error ?? 'That license key is not valid.',
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['license-status'] });
    },
  });

  const deactivate = useMutation({
    mutationFn: () => window.desktop.license.deactivate(),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: 'License removed',
        message: 'Rekordly is back on the free tier.',
      });
      void queryClient.invalidateQueries({ queryKey: ['license-status'] });
    },
  });

  if (status === undefined) {
    return null;
  }

  const label = tierLabel(status);
  const hasLicense = status.tier !== 'free' || status.expired;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="License"
        description="Rekordly is free for personal use. Pro removes the free-tier limits."
      />

      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {label.tone === 'pro' ? (
              <BadgeCheck size={18} className="text-success" aria-hidden="true" />
            ) : label.tone === 'warn' ? (
              <ShieldX size={18} className="text-warning" aria-hidden="true" />
            ) : (
              <KeyRound size={18} className="text-foreground-muted" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">{label.text}</p>
              {status.email !== undefined && (
                <p className="text-xs text-foreground-muted">{status.email}</p>
              )}
            </div>
          </div>
          {hasLicense && (
            <Button
              variant="ghost"
              size="sm"
              loading={deactivate.isPending}
              onClick={() => deactivate.mutate()}
            >
              Remove license
            </Button>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-sm border border-border bg-canvas px-3 py-2">
            <dt className="text-foreground-muted">Concurrent recordings</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {limitText(status.limits.maxConcurrent)}
            </dd>
          </div>
          <div className="rounded-sm border border-border bg-canvas px-3 py-2">
            <dt className="text-foreground-muted">Auto-record creators</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {limitText(status.limits.maxAutoRecordCreators)}
            </dd>
          </div>
          <div className="rounded-sm border border-border bg-canvas px-3 py-2">
            <dt className="text-foreground-muted">Minutes per recording</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {limitText(status.limits.maxRecordingMinutes)}
            </dd>
          </div>
        </dl>
      </div>

      {status.tier === 'free' && (
        <div className="rounded-sm border border-border bg-surface p-4">
          <label htmlFor="license-key" className="text-sm font-medium text-foreground">
            Activate a license key
          </label>
          <p className="mt-1 text-xs text-foreground-muted">
            Bought Pro or received a trial key? Paste it below — verification is
            fully offline, no account needed.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              id="license-key"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Paste your license key"
              className="flex-1 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              size="sm"
              loading={activate.isPending}
              disabled={keyInput.trim().length === 0}
              onClick={() => activate.mutate(keyInput)}
            >
              Activate
            </Button>
          </div>
          <a
            href={BUY_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink size={12} aria-hidden="true" />
            Get Rekordly Pro — $29 lifetime, 7-day free trial
          </a>
        </div>
      )}
    </div>
  );
}
