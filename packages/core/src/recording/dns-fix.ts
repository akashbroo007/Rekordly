import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

/**
 * ponytail: some ISPs block sites at the DNS level (NXDOMAIN) while the site
 * itself is reachable. When yt-dlp fails with "Could not resolve host", we
 * resolve the hostname via DNS-over-HTTPS (Cloudflare) and pin it in the
 * Windows hosts file (elevated, one UAC prompt per host), then retry. This
 * makes the fix portable: it self-heals on any network where only DNS is
 * tampered with. Full connection blocks cannot be fixed this way.
 */

const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const DOH_ENDPOINTS = [
  'https://1.1.1.1/dns-query',
  'https://8.8.8.8/resolve',
] as const;

/** Hosts we already repaired this session — never prompt for UAC twice. */
const repairedHosts = new Set<string>();

export interface DnsFixResult {
  fixed: boolean;
  /** Human-readable note about what happened (for logs / error messages). */
  note: string;
}

/** True when the yt-dlp stderr indicates a DNS resolution failure. */
export function isDnsFailure(stderr: string): boolean {
  return /could not resolve host|failed to resolve|getaddrinfo|name or service not known|nodename nor servname/i.test(stderr);
}

/** Extract the first hostname yt-dlp could not resolve. */
export function extractUnresolvedHost(stderr: string): string | null {
  // ponytail: match every observed yt-dlp phrasing:
  //   "Could not resolve host: www.xvideos.com"   (curl_cffi)
  //   "Failed to resolve 'www.xvideos.com'"       (python urllib)
  //   "Failed to resolve 'www.xvideos.com' ([Errno 11001] getaddrinfo failed)"
  const patterns = [
    /could not resolve host:\s*([a-z0-9.-]+\.[a-z]{2,})/i,
    /failed to resolve\s+['"]([a-z0-9.-]+\.[a-z]{2,})['"]/i,
    /(?:host|name):\s*([a-z0-9.-]+\.[a-z]{2,})/i,
  ];
  for (const pattern of patterns) {
    const match = stderr.match(pattern);
    if (match !== null) return match[1]!.toLowerCase();
  }
  return null;
}

/** Resolve a hostname via DNS-over-HTTPS (bypasses ISP DNS tampering). */
export async function resolveViaDoh(hostname: string): Promise<string | null> {
  for (const endpoint of DOH_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}?name=${encodeURIComponent(hostname)}&type=A`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8000),
      });
      const data = (await response.json()) as {
        Status?: number;
        Answer?: Array<{ type: number; data: string }>;
      };
      if (data.Status !== 0) continue;
      const a = (data.Answer ?? []).find((record) => record.type === 1);
      if (a !== undefined && /^\d+\.\d+\.\d+\.\d+$/.test(a.data)) return a.data;
    } catch {
      // try the next DoH endpoint
    }
  }
  return null;
}

/** True when the hosts file already pins this hostname. */
async function hostsAlreadyPinned(hostname: string): Promise<boolean> {
  try {
    const hosts = await readFile(HOSTS_PATH, 'utf8');
    return new RegExp(`^\\s*\\d+\\.\\d+\\.\\d+\\.\\d+\\s+.*\\b${hostname.replace(/\./g, '\\.')}\\b`, 'm').test(hosts);
  } catch {
    return false;
  }
}

/**
 * Append "IP hostname" to the hosts file via an elevated PowerShell one-liner.
 * Triggers a single UAC prompt. Returns false if the user denied it.
 */
async function pinHost(hostname: string, ip: string): Promise<boolean> {
  const script = [
    `$hosts = Get-Content -Path '${HOSTS_PATH}' -Raw;`,
    `if ($hosts -notmatch [regex]::Escape('${hostname}')) {`,
    `Add-Content -Path '${HOSTS_PATH}' -Value "${ip} ${hostname}";`,
    `ipconfig /flushdns | Out-Null`,
    `}`,
  ].join(' ');
  return new Promise<boolean>((resolvePromise) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile', '-Command',
        'Start-Process', 'powershell', '-Verb', 'RunAs', '-Wait', '-WindowStyle', 'Hidden',
        '-ArgumentList', `'-NoProfile','-Command',${JSON.stringify(script).replace(/"/g, '\"')}`,
      ],
      { windowsHide: true },
    );
    child.on('close', (code) => resolvePromise(code === 0));
    child.on('error', () => resolvePromise(false));
  });
}

/**
 * Attempt the full DNS-repair flow for a failed hostname:
 * DoH resolve -> hosts pin (elevated) -> report whether a retry makes sense.
 */
export async function attemptDnsFix(hostname: string): Promise<DnsFixResult> {
  if (process.platform !== 'win32') {
    return { fixed: false, note: 'DNS auto-fix is only supported on Windows' };
  }
  if (repairedHosts.has(hostname)) {
    return { fixed: false, note: `hosts entry for ${hostname} was already attempted` };
  }
  repairedHosts.add(hostname);

  if (await hostsAlreadyPinned(hostname)) {
    return { fixed: true, note: `${hostname} is already pinned in the hosts file` };
  }

  const ip = await resolveViaDoh(hostname);
  if (ip === null) {
    return { fixed: false, note: `could not resolve ${hostname} via DNS-over-HTTPS either` };
  }

  const pinned = await pinHost(hostname, ip);
  if (!pinned) {
    return { fixed: false, note: `hosts repair for ${hostname} was not approved (UAC denied)` };
  }
  return { fixed: true, note: `pinned ${hostname} -> ${ip} in the hosts file` };
}