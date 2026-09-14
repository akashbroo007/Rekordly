import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { shell } from 'electron';
import type { Logger } from '@rekordly/shared';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Per-file scope — Rekordly only touches files it created itself. */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FLOW_TIMEOUT_MS = 5 * 60_000;

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export interface GoogleDriveOAuthResult {
  refreshToken: string;
  accessToken?: string;
  expiresIn?: number;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('loopback server could not bind'));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

/** ponytail: map Google's OAuth error codes to actionable setup hints. */
function describeGoogleAuthError(error: string): string {
  switch (error) {
    case 'access_denied':
      return (
        'Google blocked the sign-in (Error 403: access_denied). Your OAuth consent screen is in ' +
        'Testing mode, so only approved testers can connect. In Google Cloud Console go to ' +
        '"APIs & Services" > "OAuth consent screen" > "Audience" > "Test users", add the Google ' +
        'account you sign in with, then click Connect Google Account again.'
      );
    case 'org_internal':
      return (
        'This OAuth client is restricted to Google Workspace accounts inside one organisation. ' +
        'Create a new OAuth client whose consent screen user type is "External".'
      );
    default:
      return `Google sign-in failed: ${error}`;
  }
}

/**
 * ponytail: RFC 8252 loopback OAuth flow. Opens the system browser at the
 * Google consent page, catches the redirect on a one-shot local server and
 * exchanges the auth code for tokens. Works with a "Desktop app" OAuth
 * client — Google allows implicit http://127.0.0.1 loopback redirects.
 */
export async function runGoogleDriveOAuth(
  clientId: string,
  clientSecret: string,
  logger: Logger,
): Promise<GoogleDriveOAuthResult> {
  const state = randomUUID();
  let settled = false;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/') {
      res.writeHead(404);
      res.end();
      return;
    }
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const validState = url.searchParams.get('state') === state;
    const page =
      error !== null
        ? '<html><body style="font-family:sans-serif;background:#111;color:#eee;text-align:center;padding-top:60px"><h2>Google sign-in was cancelled.</h2><p>You can close this window and try again in Rekordly.</p></body></html>'
        : '<html><body style="font-family:sans-serif;background:#111;color:#eee;text-align:center;padding-top:60px"><h2>Google Drive connected!</h2><p>You can close this window and return to Rekordly.</p></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
    if (settled) return;
    // ponytail: only commit the flow on a real redirect — a stray request
    // (favicon, port scanner) with no code/error must not swallow the flow.
    if (!validState) return;
    if (error !== null) {
      settled = true;
      server.emit('oauth-error', new Error(describeGoogleAuthError(error)));
      return;
    }
    if (code !== null) {
      settled = true;
      server.emit('oauth-code', code);
    }
  });

  const port = await listen(server);
  const redirectUri = `http://127.0.0.1:${port}`;

  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Google sign-in timed out — no browser response within 5 minutes.'));
    }, FLOW_TIMEOUT_MS);
    server.once('oauth-code', (value: string) => {
      clearTimeout(timeout);
      resolve(value);
    });
    server.once('oauth-error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', DRIVE_SCOPE);
  // offline access + consent forces Google to hand back a refresh token
  // even when the user granted the app before.
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  await shell.openExternal(authUrl.toString());
  logger.info({ redirectUri }, 'google drive oauth: browser opened');

  const code = await codePromise.finally(() => {
    closeServer(server);
  });

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
    const detail = tokens.error_description ?? tokens.error ?? `HTTP ${tokenResponse.status}`;
    logger.warn({ detail }, 'google drive oauth token exchange failed');
    throw new Error(`Google token exchange failed: ${detail}`);
  }

  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
  };
}
