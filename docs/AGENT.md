# AGENT.md

# Rekordly AI Development Guide

Version: 1.0

---

# Purpose

This document explains how every AI coding agent (Claude Code, Cursor, Windsurf, Codex, Gemini CLI, etc.) should work on this project.

It is the first document that must be read before making any code changes.

Never start coding before understanding this document.

---

# Required Reading Order

Before implementing anything, read the documents in this exact order.

1. TECH_STACK.md
2. MASTER_PROMPT.md
3. PRD.md
4. ARCHITECTURE.md
5. DESIGN.md
6. AGENT.md

If there is a conflict, follow this priority.

MASTER_PROMPT.md

↓

ARCHITECTURE.md

↓

TECH_STACK.md

↓

PRD.md

↓

DESIGN.md

↓

AGENT.md

---

# Mission

Your responsibility is not to write code.

Your responsibility is to improve the project.

Every commit should make the application

Cleaner

Faster

More maintainable

More reusable

More consistent

---

# Development Workflow

Whenever given a task,

always follow this process.

## Step 1

Understand the request.

Never immediately edit code.

---

## Step 2

Locate the affected modules.

Understand how they work.

Review related files.

---

## Step 3

Think first.

Consider

Architecture

Plugins

Performance

Future scalability

Code reuse

---

## Step 4

Create a small implementation plan.

Only then begin coding.

---

## Step 5

Implement.

Never rush.

Never duplicate logic.

---

## Step 6

Review your own work.

Check

TypeScript

ESLint

Architecture

UI consistency

Error handling

---

## Step 7

Only finish once everything works.

---

# Development Principles

## Build Slowly

Never generate massive changes unless explicitly requested.

Prefer

Small

Focused

Reviewable

Commits.

---

## Reuse Existing Code

Before writing new code,

search the project.

If similar functionality exists,

reuse it.

---

## Never Duplicate Logic

If the same logic appears twice,

extract it.

---

## Respect Module Boundaries

UI

↓

Core

↓

Plugin SDK

↓

Plugins

↓

Recorder

↓

Database

Never bypass layers.

---

# Plugin Philosophy

The application is Plugin First.

If a feature belongs to

authentication

cookies

selectors

website parsing

API communication

stream extraction

creator lookup

live detection

it belongs inside a plugin.

Never inside the core.

---

# UI Philosophy

Every screen should feel

Fast

Minimal

Professional

Desktop Native

Not like a website.

Whenever implementing UI,

always ask

Can this be simplified?

---

# Architecture First

Never solve problems with hacks.

If a feature requires changing architecture,

improve the architecture first.

Then implement the feature.

---

# Before Adding Dependencies

Always ask

Can we build this ourselves?

Does another package already solve it?

Is this dependency actively maintained?

Does it increase bundle size?

Will contributors understand it?

Only add dependencies with clear value.

---

# Performance Rules

Avoid

Large rerenders

Blocking operations

Duplicate browser instances

Memory leaks

Long synchronous work

Heavy computations in React

Use

Worker Threads

Virtualized Lists

Memoization

Lazy Loading

Browser Pools

---

# Error Handling

Every operation should return meaningful errors.

Never

catch {}

Never

console.log(error)

Instead

Log properly.

Show user-friendly messages.

Allow recovery.

---

# Logging

Log important events only.

Examples

Recording Started

Recording Finished

Recording Failed

Plugin Loaded

Plugin Failed

Database Error

Scheduler Error

Application Error

Avoid noisy logs.

---

# Documentation

Whenever architecture changes,

update documentation.

Never allow documentation to become outdated.

If a feature changes,

update

PRD

Architecture

Design

when necessary.

---

# Refactoring Rules

If existing code is difficult to understand,

improve it.

Do not keep poor code simply because it works.

Leave every file cleaner than you found it.

---

# Commit Philosophy

Every commit should

Compile

Pass linting

Be understandable

Be reversible

Have one clear purpose

Avoid giant commits.

---

# When You Are Unsure

Never guess.

Search the project.

Read existing implementations.

Review documentation.

Choose the solution that best matches the architecture.

---

# What Not To Do

Do not rewrite unrelated files.

Do not introduce new patterns without justification.

Do not replace chosen libraries.

Do not move files unnecessarily.

Do not over-engineer simple features.

Do not add abstractions "just in case."

Do not hardcode platform-specific logic into the core.

---

# Definition of Done

A task is complete only if

✓ Feature works

✓ Project compiles

✓ TypeScript passes

✓ ESLint passes

✓ No duplicate logic

✓ Architecture respected

✓ UI polished

✓ Error handling added

✓ Loading state added

✓ Empty state added (if applicable)

✓ Logs added (where appropriate)

✓ Documentation updated (if needed)

---

# Communication Style

When responding to development tasks,

always provide:

1. Brief analysis

2. Implementation plan

3. Code changes

4. Validation performed

5. Remaining work (if any)

Do not produce unnecessary explanations.

Focus on execution.

---

# Project Vision

Rekordly should become the best source-available, plugin-first desktop application for livestream monitoring and recording.

Every contribution should move the project closer to that vision.

When faced with multiple valid solutions, choose the one that is:

- Simpler
- More maintainable
- More modular
- Easier for future contributors to understand

Optimize for the next contributor, not just the current implementation.
