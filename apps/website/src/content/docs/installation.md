# Installation

Rekordly is currently available for **Windows**. Both builds bundle yt-dlp and ffmpeg, so there is nothing else to install.

## System requirements

| Requirement | Minimum                        |
| ----------- | ------------------------------ |
| OS          | Windows 10 or later (64-bit)   |
| RAM         | 4 GB (8 GB recommended)        |
| Disk        | Space for recordings — you control the guardrail |
| Runtime     | None — everything is bundled   |

## Installer vs portable

Two builds are published on every release:

| Build                          | Best for                                    |
| ------------------------------ | ------------------------------------------- |
| `Rekordly Setup <version>.exe` | Normal installs. Adds Start Menu shortcuts and registers for auto-updates. |
| `Rekordly-<version>-portable.exe` | Portable use (USB sticks, no-install machines). Runs standalone with no installation step. |

## Install steps

1. Go to the [Releases page](https://github.com/akashbroo007/Rekordly/releases).
2. Download the installer (or the portable build).
3. Run it — `yt-dlp` and `ffmpeg` are bundled, so there is nothing else to install.
4. Add a creator, optionally enable **Auto-Record**, and you're done.

## Updates

Rekordly updates itself: when a new release is published on GitHub, you get an in-app notification and can download and restart with one click. Updates are delivered through `electron-updater` against GitHub Releases — no separate updater tool to maintain.

## Windows SmartScreen

The installer is not currently code-signed, so Windows SmartScreen may show a warning on first run. Click **More info → Run anyway** to proceed. If you prefer not to bypass SmartScreen, the portable build works from any folder without installation.
