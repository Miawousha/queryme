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
