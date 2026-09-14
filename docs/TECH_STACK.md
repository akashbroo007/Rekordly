# TECH_STACK.md

Version: 1.0

---

# Project Overview

Project Type:
Desktop Application

Primary Platform:
Windows 10 & Windows 11

Future Support:

- macOS
- Linux

Architecture:
Plugin-first Desktop Application

License:
PolyForm Noncommercial 1.0.0 (free for noncommercial use; commercial use requires a license from Rekordly — hello@rekordly.in)

Language:
English

---

# Core Philosophy

The application should be:

- Modern
- Fast
- Plugin-first
- Easy to contribute to
- Easy to maintain
- Easy to understand
- Source Available (contribution friendly)

Avoid unnecessary enterprise complexity.

Favor readability over cleverness.

---

# Technology Stack

## Desktop

Electron

Reason

- Mature
- Huge ecosystem
- Excellent Windows support
- Native APIs
- Auto Updates
- Huge community

---

## Frontend

React 19

Reason

- Industry standard
- Large ecosystem
- Excellent Electron support

---

## Language

TypeScript

Configuration

Strict Mode

No implicit any

No disabled checks

---

## Build Tool

Vite

Reason

- Extremely fast
- Great Electron support
- Excellent DX

---

## Styling

Tailwind CSS v4

Reason

- Fast development
- Small bundle
- Easy maintenance

---

## UI Components

Radix UI

Reason

Accessible

Composable

Well maintained

---

## Icons

Lucide React

Reason

Consistent

Community-driven

Beautiful

---

## Animations

Framer Motion

Reason

Smooth

Simple

Production ready

---

# State Management

## Global State

Zustand

Used for

Settings

Window State

Plugin State

User Preferences

Theme

Current Recording

Sidebar

Notifications

---

## Server State

TanStack Query

Used for

Database Queries

Plugin Queries

Background Jobs

Automatic Refresh

Caching

---

# Forms

React Hook Form

Validation

Zod

---

# Database

SQLite

Reason

No setup

Fast

Portable

Perfect for Desktop Apps

---

## ORM

Drizzle ORM

Reason

Excellent TypeScript

Fast

Simple migrations

Readable schema

---

## SQLite Driver

better-sqlite3

Reason

Fastest SQLite driver

Reliable

Synchronous API

Excellent Electron compatibility

---

# Browser Automation

Playwright

Reason

Reliable

Supports Chromium

Supports Firefox

Supports WebKit

Powerful automation

---

# Recording

FFmpeg

Purpose

Video processing

Audio processing

Metadata

Remuxing

Thumbnail generation

---

yt-dlp

Purpose

Stream downloading

HLS

DASH

Metadata

Quality selection

Resume support

---

# Logging

Pino

Reason

Very fast

Structured logging

Simple API

---

# Charts

Recharts

Purpose

Analytics

Statistics

Storage Usage

Recording Trends

---

# Date Library

date-fns

Reason

Lightweight

Tree shakeable

Modern API

---

# Table Component

TanStack Table

Purpose

Recording Library

Plugin Manager

Download Manager

Logs

---

# Virtual Lists

TanStack Virtual

Purpose

Large recording libraries

Thousands of creators

Huge logs

---

# Notifications

Electron Native Notifications

React Hot Toast

---

# File System

Node.js fs/promises

Never use synchronous filesystem APIs in the renderer.

---

# Package Manager

pnpm

Reason

Fast

Efficient

Excellent Monorepo Support

---

# Code Formatting

Prettier

---

# Linting

ESLint

TypeScript ESLint

---

# Git Hooks

Husky

lint-staged

---

# Testing

Unit

Vitest

Component

React Testing Library

Automation

Playwright

---

# Build

Electron Builder

Purpose

Windows Installer

Portable Build

Auto Update

Code Signing

---

# Updates

electron-updater

Future Support

GitHub Releases

Custom Update Server

---

# Folder Structure

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

---

# Package Responsibilities

## core

Business logic

Services

Schedulers

Plugin Manager

Application logic

Never contains UI.

---

## database

Drizzle

SQLite

Repositories

Migrations

Database utilities

---

## recorder

Recording engine

FFmpeg wrapper

yt-dlp wrapper

Queue

Bandwidth

Recovery

---

## plugin-sdk

Interfaces

Types

Contracts

Lifecycle

Capability system

Plugin API

---

## shared

Utilities

Constants

Helpers

Common Types

Validation

---

## ui

Reusable components

Theme

Icons

Design Tokens

---

# Renderer Stack

React

↓

Zustand

↓

TanStack Query

↓

Components

↓

Electron IPC

---

# Main Process

Electron

↓

Plugin Manager

↓

Database

↓

Recorder

↓

Scheduler

↓

Workers

---

# IPC

Only typed IPC.

Never expose Electron directly to React.

Always use preload.ts.

No Node Integration.

Context Isolation enabled.

Sandbox enabled.

---

# Plugin Architecture

Every platform is a plugin.

Examples

plugins/

    stripchat/

    chaturbate/

    camsoda/

    twitch/

    youtube/

    generic-hls/

Core never knows these exist.

Plugins implement a shared SDK.

---

# Standard Stream Object

Every plugin returns

Stream

Creator

Title

Thumbnail

Headers

Cookies

Metadata

Quality Options

Stream URL

The recorder consumes only this object.

---

# Design Principles

Small components

Feature folders

Composition over inheritance

Single responsibility

No duplicate logic

No giant files

Maximum readability

---

# Naming Convention

Folders

kebab-case

Files

kebab-case

React Components

PascalCase

Variables

camelCase

Constants

UPPER_SNAKE_CASE

Interfaces

PascalCase

Enums

PascalCase

Types

PascalCase

---

# Performance Targets

Cold Start

<2 seconds

Memory

<300 MB idle

UI

60 FPS

Plugin startup

<1 second

Database

Indexed

Virtualized Lists

Lazy Loading

Worker Threads

Browser Pool

---

# Security

Context Isolation

Enabled

Sandbox

Enabled

Node Integration

Disabled

Typed IPC

Enabled

Secret Storage

Encrypted

Plugin Permissions

Required

---

# Things We Will NOT Use

Redux

MobX

Angular

Vue

Bootstrap

Material UI

jQuery

Express

MongoDB

PostgreSQL

MySQL

Prisma

Socket.IO

Next.js

NestJS

Microservices

Docker

Redis

GraphQL

Electron Remote Module

---

# Guiding Principle

Every technology in this document has been chosen intentionally.

The agent must not replace, upgrade, or swap technologies unless explicitly instructed by the project maintainer.

When implementing features, always follow this document as the authoritative technical specification.
