# DESIGN.md

# Rekordly Design System

Version: 1.0

---

# Design Philosophy

Rekordly should feel like modern desktop software.

Inspired by applications such as:

- Visual Studio Code
- GitHub Desktop
- Docker Desktop
- Figma
- Arc Browser
- Linear

The interface should feel:

- Professional
- Calm
- Modern
- Fast
- Minimal
- Information Dense
- Beautiful

Never resemble a generic web admin dashboard.

---

# Design Principles

## Simplicity

Every screen should have one primary purpose.

Avoid visual clutter.

---

## Consistency

Every page should follow the same spacing, typography and interaction patterns.

---

## Efficiency

Power users should rarely need the mouse.

Keyboard shortcuts should exist for all common actions.

---

## Accessibility

Keyboard navigation

Focus states

High contrast

Screen reader friendly

Minimum touch targets

Readable typography

---

# Theme

Dark First

Light theme may be added later.

---

# Color Palette

## Background

Primary

#0F1115

Secondary

#171A21

Surface

#1E232D

Elevated

#252B36

Hover

#2C3442

Border

#323B4A

---

## Primary

Blue

#3B82F6

Hover

#2563EB

---

## Success

#22C55E

---

## Warning

#F59E0B

---

## Error

#EF4444

---

## Info

#06B6D4

---

## Text

Primary

#FFFFFF

Secondary

#B8C0CC

Muted

#8B95A5

Disabled

#667085

---

# Typography

Primary Font

Inter

Fallback

system-ui

Weights

400

500

600

700

No decorative fonts.

---

# Radius

Small

8px

Medium

12px

Large

16px

Dialogs

20px

---

# Shadows

Very subtle.

Prefer borders over shadows.

Use shadows only for

Menus

Dialogs

Floating panels

---

# Spacing System

Use an 8-point grid.

Allowed spacing values

4

8

12

16

24

32

40

48

64

Avoid arbitrary spacing.

---

# Icons

Lucide Icons only.

Size

16

18

20

24

Never mix icon libraries.

---

# Animation

Use Framer Motion.

Animations should be

Fast

Subtle

Purposeful

Avoid flashy transitions.

Standard durations

100ms

150ms

200ms

300ms

---

# Window Layout

```
+------------------------------------------------------+
| Title Bar                                            |
+------------------------------------------------------+
| Sidebar | Toolbar                                    |
|         +--------------------------------------------|
|         |                                            |
|         |                                            |
|         |             Main Content                   |
|         |                                            |
|         |                                            |
|         +--------------------------------------------|
|         | Status Bar                                 |
+------------------------------------------------------+
```

---

# Sidebar

Contains

Dashboard

Creators

Recordings

Library

Downloads

Plugins

Analytics

Logs

Settings

Collapsed width

72px

Expanded width

260px

Resizable

Yes

---

# Toolbar

Contains

Search

Quick Actions

Notifications

Current Recording

Settings Shortcut

Plugin Indicator

---

# Dashboard

Contains

Quick Stats

Current Recordings

Recent Activity

Plugin Health

Storage Usage

System Performance

Recent Logs

---

# Cards

Cards should have

Rounded corners

Subtle border

Minimal shadow

Clear hierarchy

Hover state

---

# Tables

Use TanStack Table.

Features

Sorting

Filtering

Resizing

Selection

Column visibility

Pagination

Virtualization

---

# Buttons

Primary

Filled

Secondary

Outline

Danger

Red

Ghost

Transparent

Icon

Square

Loading

Spinner

Disabled

Lower opacity

---

# Inputs

Rounded

Clear labels

Inline validation

Keyboard friendly

---

# Dialogs

Centered

Blur background

Escape to close

Focus trap

Animated

---

# Toasts

Bottom Right

Auto dismiss

Success

Error

Warning

Info

---

# Notifications

Native desktop notifications.

Also display inside Notification Center.

---

# Search

Global search.

Ctrl + K

Should search

Creators

Recordings

Plugins

Settings

Commands

---

# Context Menus

Every list should support right-click actions.

Examples

Open

Record

Delete

Rename

Copy

Properties

---

# Empty States

Every page must have an empty state.

Examples

No creators

No recordings

No plugins

No downloads

Include

Illustration

Title

Description

Primary Action

---

# Loading States

Skeletons instead of spinners whenever possible.

Never leave blank pages.

---

# Error States

Friendly message

Error details

Retry button

Copy error button

Open logs button

---

# Recording Status Colors

Recording

Red

Queued

Blue

Paused

Yellow

Completed

Green

Failed

Red

Uploading

Purple

Processing

Orange

---

# Library View

Supports

Grid

List

Compact

Details

Remember user preference.

---

# Recording Card

Display

Thumbnail

Creator

Platform

Duration

Resolution

File Size

Recording Date

Quick Actions

---

# Plugin Manager

Each plugin card displays

Name

Version

Author

Status

Capabilities

Permissions

Settings

Enable Toggle

---

# Settings

Categorized

General

Appearance

Recording

Plugins

Downloads

Notifications

Performance

Developer

---

# Status Bar

Displays

Plugin Count

Recording Count

CPU Usage

Memory Usage

Current Task

Application Version

---

# Keyboard Shortcuts

Ctrl + K

Command Palette

Ctrl + N

Add Creator

Ctrl + R

Refresh

Ctrl + ,

Settings

Ctrl + F

Search

Ctrl + Q

Quit

---

# Responsive Behavior

Minimum Width

1280px

Minimum Height

720px

Support resizing.

Remember window size.

Remember panel positions.

---

# Motion Principles

Animate

Dialogs

Menus

Cards

Page transitions

Sidebar

Never animate large tables.

Prefer instant interactions for productivity.

---

# Visual Style

Use

Subtle gradients

Glass only where appropriate

Soft borders

Minimal shadows

Strong typography

Good spacing

No excessive decorations.

---

# UI Goals

The application should feel like software people would gladly use every day.

Every screen should communicate

Professionalism

Clarity

Speed

Confidence

---

# Design Rule

Whenever implementing a new screen, ask:

Can a first-time user understand this in five seconds?

If not,

simplify it.
