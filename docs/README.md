# Rekordly

Cross-platform desktop app for monitoring, recording, and downloading live streams, with a library, analytics, and plugin system.

## Tech stack

- **Electron + React 19 + TypeScript** (electron-vite)
- **Tailwind CSS v4**
- **Drizzle ORM + better-sqlite3**
- **pnpm workspaces** monorepo

## Project structure

```
Rekordly/
├── apps/desktop        Electron application (main / preload / renderer)
├── packages/
│   ├── core            Recording, downloads, monitoring, plugin manager
│   ├── database        Drizzle schema, migrations, repositories
│   ├── plugin-sdk      API for writing site plugins
│   ├── recorder        yt-dlp / ffmpeg wrappers and record queue
│   ├── shared          Shared types and IPC contracts
│   └── ui              Shared React components and theme
├── plugins/            Site plugins (camsoda, chaturbate, stripchat, twitch, youtube)
├── docs/               Architecture, PRD, design and guides
├── scripts/            Development and debug utilities
└── tests/
```

## Getting started

```bash
pnpm install          # install dependencies (builds native modules)
pnpm build            # build all packages + desktop app
pnpm dev              # run the desktop app in dev mode
pnpm typecheck        # typecheck every workspace package
```

## Documentation

See [docs/](./docs) - start with `ARCHITECTURE.md`, `PRD.md`, and `PLUGIN_GUIDE.md`.

## License

See [LICENSE.txt](../LICENSE.txt).
