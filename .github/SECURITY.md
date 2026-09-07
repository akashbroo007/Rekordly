# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Rekordly, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email the maintainers with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

## Response

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Scope

This security policy applies to:

- The Rekordly desktop application
- The plugin SDK
- The core packages

Out of scope:

- Third-party plugins
- Dependencies (report upstream)

## Security Measures

Rekordly implements:

- Context Isolation (Electron)
- Sandboxed renderer
- Typed IPC (no raw Electron API exposure)
- Encrypted secret storage
- Plugin permission system
