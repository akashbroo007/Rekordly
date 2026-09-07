import type { CreatorInfo, StreamObject } from '@rekordly/plugin-sdk';

/**
 * Deterministic mock data for the example plugin.
 * Never touches the network; exists only to validate the plugin architecture.
 */

const LIVE_USERNAME = 'nordstar';

export const MOCK_CREATORS: CreatorInfo[] = [
  {
    id: 'mock:nordstar',
    username: 'nordstar',
    displayName: 'Nordstar',
    avatarUrl: 'https://placehold.co/96x96?text=NS',
    profileUrl: 'https://mock.example/nordstar',
    bio: 'Nightly chill streams and music.',
    followerCount: 42_000,
    isLive: true,
    liveUrl: 'https://mock.example/nordstar/live',
  },
  {
    id: 'mock:helvetika',
    username: 'helvetika',
    displayName: 'Helvetika',
    avatarUrl: 'https://placehold.co/96x96?text=HV',
    profileUrl: 'https://mock.example/helvetika',
    bio: 'Design talk and co-working streams.',
    followerCount: 8_400,
  },
  {
    id: 'mock:oscar-oxide',
    username: 'oscar-oxide',
    displayName: 'Oscar Oxide',
    avatarUrl: 'https://placehold.co/96x96?text=OO',
    profileUrl: 'https://mock.example/oscar-oxide',
    bio: 'Hardware, soldering and late-night coding.',
    followerCount: 17_900,
  },
];

export function isLiveNow(username: string): boolean {
  return username.toLowerCase() === LIVE_USERNAME;
}

export function buildMockStream(username: string): StreamObject {
  return {
    creatorId: `mock:${username.toLowerCase()}`,
    creatorName: username,
    platformId: 'mock-platform',
    title: `${username} is live on Mock Platform`,
    streamUrl: `https://cdn.mock.example/hls/${username}/master.m3u8`,
    thumbnail: 'https://placehold.co/640x360?text=Live',
    headers: { 'User-Agent': 'Rekordly/0.1 (mock-plugin)' },
    cookies: [
      {
        name: 'mock_session',
        value: 'mock-cookie-value',
        domain: '.mock.example',
        path: '/',
        secure: true,
      },
    ],
    qualityOptions: [
      { id: 'best', label: 'Best', format: 'hls', resolution: '1080p60', isBest: true },
      { id: '720p', label: '720p', format: 'hls', resolution: '720p' },
      { id: '480p', label: '480p', format: 'hls', resolution: '480p' },
    ],
    metadata: {
      category: 'Just Chatting',
      tags: ['mock', 'architecture-test'],
      resolution: '1080p60',
    },
    startedAt: new Date().toISOString(),
  };
}
