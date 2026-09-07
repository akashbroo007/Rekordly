# ARCHITECTURE.md

# Rekordly Architecture

Version: 1.0

---

# Overview

Rekordly is a plugin-first desktop application.

The application's responsibility is to provide a platform for monitoring creators, recording livestreams, managing recordings, and organizing media.

The application **must never know how individual websites work.**

Website-specific logic always belongs inside plugins.

---

# High-Level Architecture

```
                 React UI
                     │
                     ▼
             Electron Renderer
                     │
         Typed IPC (preload.ts)
                     │
                     ▼
             Electron Main Process
                     │
     ┌───────────────┼────────────────┐
     │               │                │
     ▼               ▼                ▼
 Plugin Manager   Recorder       Database
     │               │                │
     ▼               │                │
 Plugins            FFmpeg            SQLite
     │               │
     ▼               ▼
 Playwright      yt-dlp
```

---

# Design Principles

## Plugin First

The core application never contains:

- Website selectors
- Cookies
- Authentication logic
- Stream extraction
- Platform APIs
- Platform parsing

Everything belongs inside plugins.

---

## Separation of Concerns

Every package has exactly one responsibility.

UI renders.

Core coordinates.

Plugins communicate with websites.

Recorder records.

Database stores data.

---

# Monorepo Structure

```
Rekordly/

apps/
    desktop/

packages/
    core/
    database/
    recorder/
    plugin-sdk/
    shared/
    ui/

plugins/
    example/

docs/

scripts/

tests/
```

---

# Package Responsibilities

## apps/desktop

Contains

- Electron
- React
- Window management
- Routing
- IPC client

No business logic.

---

## packages/core

Contains

- Plugin Manager
- Scheduler
- Monitoring Service
- Recording Service
- Upload Service
- Settings Service
- Notification Service

Acts as the application's brain.

---

## packages/database

Contains

- SQLite
- Drizzle ORM
- Repositories
- Migrations
- Seed data

Only this package accesses the database directly.

---

## packages/plugin-sdk

Contains

- Interfaces
- Types
- Contracts
- Plugin lifecycle
- Capability system

Used by every plugin.

---

## packages/recorder

Contains

- FFmpeg wrapper
- yt-dlp wrapper
- Queue manager
- Recording lifecycle
- File validation
- Thumbnail generation

Knows nothing about websites.

---

## packages/ui

Contains

Reusable UI components.

Buttons

Dialogs

Inputs

Tables

Cards

Charts

Modals

Layout components

---

## packages/shared

Contains

Utilities

Helpers

Validation

Constants

Shared types

Common functions

---

# Electron Architecture

```
Renderer

↓

IPC

↓

Main Process

↓

Core Services

↓

Plugins

↓

Recorder

↓

Database
```

Renderer never talks directly to

- Database
- Playwright
- FFmpeg
- File System

---

# IPC Design

Every IPC call must be typed.

Example

```
renderer

↓

recording.start()

↓

preload

↓

ipcRenderer.invoke()

↓

main

↓

RecordingService

↓

response
```

Never expose Electron APIs directly.

---

# Core Modules

## Dashboard Module

Displays

- Live creators
- Recordings
- Statistics
- Recent activity

---

## Creator Module

Responsible for

Adding creators

Editing creators

Searching

Grouping

Import

Export

---

## Plugin Manager

Responsibilities

Load plugins

Unload plugins

Enable

Disable

Update

Permission checks

Health checks

Version compatibility

---

## Scheduler

Responsible for

Polling creators

Scheduling checks

Retry logic

Health monitoring

Delegates all platform work to plugins.

---

## Monitoring Engine

Workflow

```
Scheduler

↓

Plugin

↓

Check Creator

↓

Live?

↓

YES

↓

Return Stream

↓

Recorder
```

---

## Recorder

Workflow

```
Plugin

↓

Standard Stream Object

↓

Recorder Queue

↓

yt-dlp

↓

FFmpeg

↓

Verification

↓

Library
```

Recorder never knows

Platform

Authentication

Selectors

Cookies

APIs

---

# Standard Stream Object

Every plugin returns

```ts
{
  creatorId;
  creatorName;
  platformId;

  title;

  streamUrl;

  thumbnail;

  metadata;

  qualityOptions;

  headers;

  cookies;

  startedAt;
}
```

Recorder only understands this object.

---

# Plugin Lifecycle

```
Install

↓

Load

↓

Initialize

↓

Authenticate

↓

Monitor

↓

Detect Live

↓

Extract Stream

↓

Record

↓

Cleanup

↓

Unload
```

---

# Plugin Responsibilities

Plugins are responsible for

Authentication

Cookies

Selectors

Platform APIs

Creator search

Metadata

Live detection

Stream extraction

Platform settings

Nothing else.

---

# Worker Threads

Heavy tasks should run in workers.

Examples

Thumbnail generation

Metadata extraction

Hash calculation

Large file scanning

Video validation

Never block the UI thread.

---

# Browser Pool

Do not launch a browser for every creator.

Maintain a browser pool.

```
Browser

↓

Context

↓

Page

↓

Creator Check

↓

Reuse
```

Reuse browser contexts whenever possible.

---

# Recording Queue

```
Queued

↓

Preparing

↓

Recording

↓

Verifying

↓

Completed

↓

Indexed
```

Every state is recoverable.

---

# Database Flow

```
UI

↓

Repository

↓

Drizzle

↓

SQLite
```

React never executes SQL.

---

# Logging Flow

Every important event generates logs.

Examples

Plugin Loaded

Plugin Failed

Recording Started

Recording Finished

Recording Failed

Scheduler Error

Database Error

Upload Error

Logs are stored locally.

---

# Folder Rules

Feature-based organization.

Avoid dumping everything into utils.

Avoid giant services.

Avoid giant React components.

---

# Dependency Rules

Allowed

```
UI

↓

Core

↓

Database

↓

SQLite
```

Allowed

```
UI

↓

Core

↓

Plugin SDK

↓

Plugin
```

Not Allowed

```
Plugin

↓

React
```

Not Allowed

```
Plugin

↓

UI
```

Not Allowed

```
Recorder

↓

Plugin
```

The recorder only understands the Standard Stream Object.

---

# Data Flow

```
Plugin

↓

Stream Object

↓

Recorder

↓

Database

↓

Library

↓

Dashboard
```

---

# Error Handling

Every module returns structured errors.

Never throw raw strings.

Every error contains

Code

Message

Details

Recoverable

Timestamp

---

# Security

Renderer

Sandboxed

↓

Typed IPC

↓

Main Process

↓

File System

↓

Plugins

Plugins never access the renderer directly.

---

# Performance Goals

Startup

<2 seconds

Idle Memory

<300 MB

60 FPS UI

Support

1000 creators

100,000 recordings

Virtualized lists

Lazy loading

Worker threads

Browser reuse

---

# Future Expansion

The architecture should support future plugins without modifying

Core

Recorder

Database

UI

Scheduler

Adding a new platform should only require creating a new plugin that implements the Plugin SDK.

---

# Guiding Principle

If a future developer wants to add support for a new streaming platform, they should only need to create a new plugin.

The core application should not require modification.
