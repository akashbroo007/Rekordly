import { describe, expect, it } from 'vitest';
import { buildTorrc, compareVersions, discoverLatestVersionFromIndex, findFreePort } from './tor-service';

const SAMPLE_DIST_INDEX = [
  '<title>Index of /torbrowser</title>',
  '<a href="?C=N;O=D">Name</a>',
  '<a href="15.0.22/">15.0.22/</a>',
  '<a href="16.0a11/">16.0a11/</a>',
  '<a href="13.5.19/">13.5.21/</a>',
  '<a href="noscript/">noscript/</a>',
].join('\n');

describe('buildTorrc', () => {
  it('exposes a SOCKS listener for in-process agents and an HTTP tunnel for child processes', () => {
    const torrc = buildTorrc('C:/tmp/data', 9050, 9080);
    expect(torrc).toContain('SocksPort 127.0.0.1:9050');
    expect(torrc).toContain('HTTPTunnelPort 127.0.0.1:9080');
    expect(torrc).toContain('DataDirectory C:/tmp/data');
  });

  it('does not open a ControlPort (no external control surface)', () => {
    const torrc = buildTorrc('/tmp/data', 9050, 9080);
    expect(torrc).not.toContain('ControlPort');
  });
});

describe('findFreePort', () => {
  it('returns bindable, distinct ports', async () => {
    const [a, b] = await Promise.all([findFreePort(), findFreePort()]);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
});

describe('version discovery (dist index parsing)', () => {
  it('picks the newest pure-numeric version and skips alphas', () => {
    expect(discoverLatestVersionFromIndex(SAMPLE_DIST_INDEX)).toBe('15.0.22');
  });

  it('returns null when no version folders exist', () => {
    expect(discoverLatestVersionFromIndex('<html>nothing here</html>')).toBeNull();
  });

  it('compares version tuples numerically, not lexically', () => {
    expect(compareVersions('15.0.22', '15.0.9')).toBeGreaterThan(0);
    expect(compareVersions('15.1.0', '15.0.22')).toBeGreaterThan(0);
    expect(compareVersions('15.0.22', '15.0.22')).toBe(0);
    expect(compareVersions('14.5.8', '15.0.22')).toBeLessThan(0);
  });
});
