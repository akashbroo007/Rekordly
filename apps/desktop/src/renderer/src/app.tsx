import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { WelcomeOnboarding } from './components/onboarding/welcome-onboarding';
import { CommandPalette } from './components/command-palette';
import { ErrorBoundary } from './components/error-boundary';
import { AppLayout } from './components/layout/app-layout';
import { ToastStack } from './components/toast-stack';
import { useRecordingEvents } from './lib/use-recording-events';
import { AnalyticsPage } from './pages/analytics';
import { CreatorsPage } from './pages/creators';
import { DashboardPage } from './pages/dashboard';
import { DownloadsPage } from './pages/downloads';
import { UploadsPage } from './pages/uploads';
import { LibraryPage } from './pages/library';
import { LogsPage } from './pages/logs';
import { PluginsPage } from './pages/plugins';
import { RecordingsPage } from './pages/recordings';
import { SettingsPage } from './pages/settings';
import { useThemeStore } from './stores/theme-store';
import { logger } from './lib/logger';
import { queryClient } from './lib/query-client';

function EventBridge() {
  useRecordingEvents();
  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

/**
 * ponytail: everything that uses react-query hooks must live INSIDE the
 * QueryClientProvider — calling useQuery/useQueryClient in App itself
 * crashed the whole renderer (black screen on launch).
 */
function AppShell() {
  const mode = useThemeStore((state) => state.mode);
  const queryClient = useQueryClient();

  // First-launch onboarding state (also drives "Replay Welcome Tour").
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  // ponytail: Low-Resource Mode disables UI animations globally via CSS.
  useEffect(() => {
    document.documentElement.dataset.lowres =
      settings?.lowResourceMode === true ? 'true' : 'false';
  }, [settings?.lowResourceMode]);

  const completeOnboarding = async (): Promise<void> => {
    await window.desktop.settings.set({ onboardingCompleted: true });
    await queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  useEffect(() => {
    logger.info('renderer ready');
  }, []);

  return (
    <>
        <EventBridge />
        <HashRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="creators" element={<CreatorsPage />} />
              <Route path="recordings" element={<RecordingsPage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="downloads" element={<DownloadsPage />} />
              <Route path="uploads" element={<UploadsPage />} />
              <Route path="plugins" element={<PluginsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          <CommandPalette />
          <ToastStack />
          {settings !== undefined && !settings.onboardingCompleted && (
            <WelcomeOnboarding onComplete={completeOnboarding} />
          )}
        </HashRouter>
    </>
  );
}
