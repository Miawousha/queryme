---
name: "spritz"
url: https://github.com/ION-Altergo/spritz
role: contributor
visibility: private
description: "Original Altergo task manager — markdown tasks, Firebase real-time collab, GSAP animations."
year: 2025
last_active: "2025-04"
language: "JavaScript"
code_bytes: 132245
archived: false
tags: [productivity]
---

spritz is the original Altergo team task manager, a single-page app in plain HTML/CSS/JS with GSAP for motion and Firebase Realtime Database for shared state. A markdown editor on the left renders into an interactive task list on the right — left-click toggles, right-click on a completed task triggers a sound-effect-driven deletion, and idle tasks slowly "ooze" via an SVG goo filter after 24 hours. Real-time collab is genuinely wired: every board has a `?taskId=` URL, and `database.ref('taskLists/' + id).on('value', ...)` pushes edits to anyone holding the link. Hosted on Firebase App Hosting; superseded internally by `spritz-modern`.

## What
Users write tasks as markdown lines (`[ ] Fix bug @alice p**`) — the `@owner` suffix tags assignees and `p*` / `p**` / `p***` set priority levels rendered as color-coded badges. The editor pane stays the source of truth; the right pane is a model-rendered, click-interactive list with audio cues on toggle and a goo-filter destruction animation on right-click delete. A share link at the bottom carries the board's `?taskId=` so opening the URL in another tab or device joins the same Firebase node live.

## Tech
Vanilla JS broken into focused modules: `markdownParser.js` parses lines into a task model, `modelRenderer.js` paints the interactive list, `animations.js` drives GSAP timelines and the SVG goo filter, `skinManager.js` swaps CSS+JS skin bundles (default and dark-blue ship in `js/skins/`), and `share.js` owns the Firebase v8 SDK setup, URL `?taskId=` handling, `database.ref('taskLists/' + id).set(...)` saves, and `.on('value', ...)` subscriptions. Stale-task "ooze" compares `lastUpdated` server timestamps to now and ramps the goo filter past the 24h mark. Deployed via `apphosting.yaml` to Firebase App Hosting; `database.rules.json` keeps the realtime DB open to anyone holding a task ID.

## Status
Built and used by the Altergo team through 2025, last active April 2025. Internally superseded by `spritz-modern` (the React rewrite) and then by Alexandre's personal SvelteKit version. Codebase frozen in plain-JS form; the Firebase project (`spritz-31ad5`) and live URLs still resolve.
