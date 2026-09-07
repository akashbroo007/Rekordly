import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, HardDrive, MemoryStick, Radio } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@rekordly/ui';
import { SpotlightTour, type SpotlightStep } from './spotlight-tour';

interface WelcomeOnboardingProps {
  /** Persists onboardingCompleted=true (called when the tour ends or is skipped). */
  onComplete: () => Promise<void>;
}

type Phase = 'welcome' | 'hardware' | 'tour';

const TOUR_STEPS: readonly SpotlightStep[] = [
  {
    tourId: 'nav-dashboard',
    path: '/',
    emoji: '🏠',
    title: 'Dashboard — your mission control',
    description:
      'Everything happening right now: live creators, active recordings, storage and system health — all on one screen.',
    tip: 'Press Ctrl+K anywhere to open the command palette',
  },
  {
    tourId: 'nav-creators',
    path: '/creators',
    emoji: '👀',
    title: 'Creators — who you follow',
    description:
      'Add the creators you love. Rekordly watches them around the clock and can auto-record the moment they go live — you never miss a stream.',
    tip: 'Try adding your first creator here',
  },
  {
    tourId: 'nav-recordings',
    path: '/recordings',
    emoji: '🔴',
    title: 'Recordings — live captures',
    description:
      'Watch captures happen in real time. Pause, resume, cancel or retry any job — you are always in control.',
  },
  {
    tourId: 'nav-library',
    path: '/library',
    emoji: '📚',
    title: 'Library — everything in one place',
    description:
      'Your personal collection: finished recordings AND downloaded videos live together here. Search, tag and organize them into collections.',
    tip: 'Both recordings and downloads end up here',
  },
  {
    tourId: 'nav-downloads',
    path: '/downloads',
    emoji: '⬇️',
    title: 'Downloads — grab any video',
    description:
      'Paste a link, queue a download, done. Files are automatically sorted into a folder per website.',
    tip: 'Use Quick Download on the Dashboard for one-off grabs',
  },
  {
    tourId: 'nav-plugins',
    path: '/plugins',
    emoji: '🧩',
    title: 'Plugins — more platforms',
    description:
      'Plugins add support for new streaming sites. Enable, disable or drop in your own — the app grows with you.',
  },
  {
    tourId: 'nav-analytics',
    path: '/analytics',
    emoji: '📊',
    title: 'Analytics — your stats',
    description:
      'See how much you have captured over time: hours recorded, storage trends and per-creator breakdowns.',
  },
  {
    tourId: 'nav-logs',
    path: '/logs',
    emoji: '📜',
    title: 'Logs — what happened',
    description:
      'A transparent, searchable history of everything the app does. Great for tracking down any hiccup.',
  },
  {
    tourId: 'nav-settings',
    path: '/settings',
    emoji: '⚙️',
    title: 'Settings — make it yours',
    description:
      'Themes, notifications, recording quality and more. On a weaker PC? Turn on Low-Resource Mode in the Performance tab for a smoother ride.',
    tip: 'Low-Resource Mode = 1 job at a time + no animations',
  },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

/**
 * First-launch experience: welcome screen → hardware check (with an
 * optional one-click Low-Resource Mode enable) → spotlight tour of the
 * sidebar. Shown only while settings.onboardingCompleted is false.
 */
export function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
  const [phase, setPhase] = useState<Phase>('welcome');
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['hardware-profile'],
    queryFn: () => window.desktop.app.getHardwareProfile(),
    staleTime: Infinity,
  });

  const enableLowResource = useMutation({
    mutationFn: async () => {
      await window.desktop.settings.set({ lowResourceMode: true });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const finish = async (): Promise<void> => {
    await onComplete();
  };

  if (phase === 'welcome') {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-panel p-8 text-center shadow-2xl">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
            <Radio className="text-primary" size={28} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">Welcome to Rekordly</h1>
          <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
            Record live streams, download videos and keep everything organized in your personal
            library — all in one place.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => setPhase('hardware')}>Get Started</Button>
            <Button variant="ghost" onClick={() => void finish()}>
              Skip tour
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'hardware') {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-panel p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-foreground">Checking your PC…</h2>
          <p className="mt-1 text-sm text-foreground-secondary">
            We detected your hardware so we can suggest the best performance settings.
          </p>

          {profile === undefined ? (
            <p className="mt-6 text-sm text-foreground-secondary">Detecting hardware…</p>
          ) : (
            <>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="shrink-0 text-primary" />
                  <dt className="text-foreground-secondary">CPU</dt>
                  <dd className="ml-auto truncate font-medium text-foreground" title={profile.cpuModel}>
                    {profile.cpuModel} · {profile.cpuCores} cores
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <MemoryStick size={16} className="shrink-0 text-primary" />
                  <dt className="text-foreground-secondary">RAM</dt>
                  <dd className="ml-auto font-medium text-foreground">{formatBytes(profile.totalMemoryBytes)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive size={16} className="shrink-0 text-primary" />
                  <dt className="text-foreground-secondary">Storage</dt>
                  <dd className="ml-auto font-medium capitalize text-foreground">
                    {profile.diskType === 'unknown' ? 'Disk' : profile.diskType.toUpperCase()} ·{' '}
                    {formatBytes(profile.freeDiskBytes)} free
                  </dd>
                </div>
              </dl>

              {profile.recommendedLowResourceMode ? (
                <div className="mt-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
                  <p className="font-medium text-foreground">Weaker hardware detected</p>
                  <p className="mt-1 text-foreground-secondary">
                    Low-Resource Mode limits recordings/downloads to one at a time and disables
                    animations, keeping things smooth on this machine.
                  </p>
                  {!enableLowResource.isSuccess && (
                    <Button
                      size="sm"
                      className="mt-2"
                      disabled={enableLowResource.isPending}
                      onClick={() => enableLowResource.mutate()}
                    >
                      {enableLowResource.isPending ? 'Enabling…' : 'Enable Low-Resource Mode'}
                    </Button>
                  )}
                  {enableLowResource.isSuccess && (
                    <p className="mt-2 font-medium text-green-500">Low-Resource Mode enabled ✓</p>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-foreground-secondary">
                  Your PC handles everything comfortably — no changes needed.
                </div>
              )}
            </>
          )}

          <Button className="mt-5 w-full" onClick={() => setPhase('tour')}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SpotlightTour steps={TOUR_STEPS} onFinish={() => void finish()} onSkip={() => void finish()} />
  );
}