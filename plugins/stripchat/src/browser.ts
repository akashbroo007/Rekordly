/**
 * ponytail: shared headless-browser launcher for the Stripchat plugin.
 * Prefers Edge (ships with Windows 10/11), falls back to Chrome, then to
 * playwright's own chromium if one is available — so browser automation
 * never hard-depends on a single vendor being installed.
 */
export const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--mute-audio',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  // ponytail: headless runs fine on software rasterization — dropping the
  // GPU process saves memory and one process per browser instance.
  '--disable-gpu',
  // ponytail: trim background features we never use (each spawns work).
  '--disable-extensions',
  '--disable-sync',
  '--disable-background-networking',
  '--disable-default-apps',
  '--no-first-run',
  '--disable-features=Translate,BackForwardCache,MediaRouter,OptimizationHints',
];

/**
 * ponytail: block resource types the player does not need (images, fonts,
 * stylesheets, analytics beacons) to cut renderer memory and CPU. MEDIA and
 * XHR/fetch requests MUST pass — observing them is how segment URLs and
 * signed playlists are learned.
 */
export async function blockHeavyResources(page: import('playwright-core').Page): Promise<void> {
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'font' || type === 'stylesheet') {
      void route.abort().catch(() => undefined);
      return;
    }
    void route.continue().catch(() => undefined);
  });
}

export async function launchHeadlessBrowser(): Promise<
  import('playwright-core').Browser
> {
  const { chromium } = await import('playwright-core');
  const channels: Array<string | undefined> = ['msedge', 'chrome', undefined];
  let lastError: unknown = null;
  for (const channel of channels) {
    try {
      return await chromium.launch({
        ...(channel !== undefined ? { channel } : {}),
        headless: true,
        args: BROWSER_LAUNCH_ARGS,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `No usable browser found (tried Edge, Chrome, bundled Chromium): ${String(lastError)}`,
  );
}
