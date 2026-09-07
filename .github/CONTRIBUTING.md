# Contributing to Rekordly

Thank you for your interest in contributing to Rekordly!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `pnpm install`
4. Start the development server: `pnpm dev`

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Windows 10/11 (primary target)

### Project Structure

```
Rekordly/
  apps/desktop/        # Electron + React application
  packages/
    core/              # Business logic, services
    database/          # SQLite, Drizzle ORM, repositories
    recorder/          # FFmpeg, yt-dlp wrappers
    plugin-sdk/        # Plugin interfaces and types
    shared/            # Utilities, types, IPC contracts
    ui/                # Reusable UI components
  plugins/             # Platform plugins
  docs/                # Documentation
```

### Scripts

```bash
pnpm dev          # Start development
pnpm build        # Build all packages
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint the codebase
pnpm test         # Run tests
```

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `pnpm typecheck` and `pnpm lint` pass
4. Write clear commit messages
5. Open a pull request

### Code Style

- TypeScript strict mode
- Functional components only
- Tailwind CSS for styling
- Lucide icons
- Follow existing patterns

### Architecture Rules

- **Plugin First**: Never put platform-specific logic in core
- **Typed IPC**: All renderer-to-main communication is typed
- **Separation of Concerns**: Each package has one responsibility
- **No Node in Renderer**: Never use Node.js APIs in renderer code

## Reporting Issues

Use the GitHub issue templates for bug reports and feature requests.

## Code of Conduct

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
