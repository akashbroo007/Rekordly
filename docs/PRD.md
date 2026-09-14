# PRD.md

# Rekordly

## Product Requirements Document (PRD)

Version: 1.0

---

# 1. Overview

## Product Name

Rekordly

---

## Product Type

Source Available

Plugin-first

Desktop Application

Windows First

Built with Electron + React + TypeScript.

---

# 2. Vision

Create the best source-available desktop application for monitoring and recording livestreams.

The application should be:

- Beautiful
- Fast
- Reliable
- Plugin-first
- Easy to contribute to
- Easy to extend

The core application should never be tied to a specific website.

Every supported platform should be implemented as a plugin.

---

# 3. Problem Statement

People who archive livestreams often rely on multiple disconnected tools:

- Browser
- Download scripts
- FFmpeg
- yt-dlp
- Manual recording
- Manual organization

There is no modern desktop application that combines everything into a single, extensible workflow.

Rekordly aims to solve this.

---

# 4. Goals

## Primary Goals

Build a desktop application capable of

- Monitoring creators
- Detecting live streams
- Recording streams
- Organizing recordings
- Managing downloads
- Managing uploads
- Providing analytics
- Supporting automation
- Supporting plugins

---

## Secondary Goals

Create an ecosystem where developers can build plugins for additional platforms without modifying the core application.

---

# 5. Non Goals

The project will NOT include

- Video editing
- Live streaming
- Video transcoding studio
- Cloud-only operation
- Mobile application
- Browser extension
- SaaS backend

Everything runs locally.

---

# 6. Target Users

## Primary

People who archive livestreams.

Researchers.

Content archivists.

Developers.

Power users.

---

## Secondary

Community contributors.

Plugin developers.

Automation enthusiasts.

---

# 7. Core Principles

The project should always be

Simple.

Modular.

Fast.

Reliable.

Open.

Maintainable.

Readable.

Plugin-first.

---

# 8. User Journey

Typical workflow

Launch application

↓

Install plugin

↓

Configure plugin

↓

Add creator

↓

Monitor creator

↓

Creator goes live

↓

Plugin detects stream

↓

Recorder starts

↓

Recording finishes

↓

Library indexes recording

↓

Optional upload

↓

Analytics updated

---

# 9. Core Features

## Dashboard

Shows

- Active recordings
- Scheduled recordings
- Live creators
- Offline creators
- Storage usage
- Recent recordings
- Plugin status
- Quick actions

---

## Creator Management

Users can

Add creator

Remove creator

Search

Tag

Favorite

Group

Bulk edit

Import

Export

---

## Monitoring

Continuously monitor creators.

Use efficient polling.

Recover automatically.

Retry failures.

Reuse browser sessions.

---

## Recording

Support

Start

Pause

Resume

Stop

Retry

Queue

Multiple recordings

Bandwidth limits

Progress

ETA

Logs

---

## Library

Every recording includes

Thumbnail

Title

Creator

Platform

Date

Duration

Resolution

File Size

Notes

Tags

Collections

Search

Filters

Sorting

---

## Download Manager

Shows

Queue

Progress

Speed

ETA

Retries

Logs

Priority

---

## Upload Manager

Future support

Google Drive

Dropbox

OneDrive

S3

NAS

FTP

Automatic upload rules.

---

## Notifications

Desktop notifications

Recording started

Recording finished

Recording failed

Plugin updates

Errors

Warnings

---

## Settings

General

Appearance

Downloads

Plugins

Recording

Performance

Notifications

Developer

---

## Analytics

Daily recordings

Weekly recordings

Storage growth

Recording success

Plugin performance

Usage statistics

---

## Plugin Manager

Install

Enable

Disable

Update

Remove

Plugin permissions

Plugin information

Plugin settings

---

# 10. Plugin System

The plugin system is the most important part of Rekordly.

The core application must never know anything about individual platforms.

Plugins provide

Authentication

Creator search

Creator metadata

Live detection

Stream extraction

Headers

Cookies

Platform-specific APIs

Selectors

Metadata

Platform-specific settings

Future platform support should only require creating a new plugin.

No changes should be required inside the core application.

---

# 11. MVP Scope

Version 1.0 includes

Dashboard

Plugin Manager

One example plugin

Creator Management

Monitoring

Recording

Library

Search

Settings

Logging

Analytics

Dark Theme

Auto Updates

Windows installer

---

# 12. Future Roadmap

Version 1.1

Cloud uploads

Improved analytics

Plugin marketplace

---

Version 1.2

Recording scheduler

Automation rules

Notification integrations

---

Version 2.0

Cross-platform support

macOS

Linux

Advanced plugin APIs

Plugin marketplace

Sync profiles

---

# 13. Performance Goals

Application startup

Less than 2 seconds

Idle memory

Less than 300 MB

UI

60 FPS

Large library support

100,000+ recordings

Large creator list

1000+ creators

---

# 14. Success Criteria

The application is considered successful if

Users can install plugins easily.

Adding a new platform requires no core modifications.

Recordings are reliable.

UI feels modern.

Performance remains smooth.

The project attracts community contributors.

---

# 15. Out of Scope

Not planned

Cloud accounts

User authentication

Subscription system

Payments

Ads

Telemetry

Always-online architecture

Enterprise deployment

CRM features

AI assistants

---

# 16. Source Available Philosophy

The project should remain

Community driven

Well documented

Easy to contribute to

Easy to understand

Friendly for first-time contributors

Modular enough that developers can create plugins without understanding the entire application.

---

# 17. Definition of Done

A feature is complete only when

✓ It compiles

✓ TypeScript passes

✓ ESLint passes

✓ It follows the architecture

✓ UI is polished

✓ Error handling exists

✓ Loading states exist

✓ Empty states exist

✓ Logs are added

✓ Documentation updated

No feature is complete until all checklist items are satisfied.

---

# Final Statement

Rekordly should become the source-available standard for modular livestream monitoring and recording.

Every architectural decision should prioritize simplicity, extensibility, and long-term maintainability over short-term convenience.
