---
name: "su2re"
role: author
visibility: private
description: "Electron desktop transcriber: faster-whisper + pyannote diarization, push-to-talk, GPT-4o-mini cleanup, Google Calendar."
year: 2025
last_active: "2025-10"
language: "JavaScript"
code_bytes: 174522
archived: false
tags: [ai, desktop, python]
---

su2re is a cross-platform Electron transcriber paired with a Python backend. The Electron main process registers a global push-to-talk shortcut and spawns one of three Python entry points — `transcriber_backend.py` for plain transcription, `..._diarization.py` for `pyannote/speaker-diarization-community-1` on top of `faster-whisper`, or `streaming_transcriber.py` — communicating via stdout `STATUS:` lines. On the JS side, `ai-improver.js` calls OpenAI `gpt-4o-mini` to clean transcripts and extract calendar events as JSON; `calendar-scheduler.js` wraps `googleapis` to OAuth into Google Calendar and insert events. Windows NSIS/portable, macOS DMG, Linux AppImage targets via electron-builder.

## What

Press Ctrl+Shift+Space anywhere on the desktop, talk, release: the audio gets transcribed locally and lands as text in the active tab. Drop an audio file (MP3/WAV/M4A/FLAC/OGG/OPUS/MP4/AVI/MKV) onto the app for a longer transcription with model-size choice (tiny to large-v2). With diarization on, speakers come out colour-coded and label-editable. The AI tab offers cleanup presets (professional tone, concise, bullets, summary); the calendar tab parses the transcript for events, asks the user to confirm, then inserts them into the primary Google Calendar.

## Tech

Two-process design: Electron `main.js` owns lifecycle, `globalShortcut.register`, `spawn('python', ...)` and parses stdout for `STATUS:` lines + payloads; renderers (`renderer.js`, `renderer-tabs.js`, `renderer-diarization.js`, `renderer-improvement.js`, `renderer-calendar.js`) split UI per feature. Python side uses `faster-whisper` for the Whisper inference and `pyannote.audio` with `speaker-diarization-community-1` for diarization, both 100% local. `ai-improver.js` calls OpenAI `gpt-4o-mini` twice for calendar mode — once to clean, once to extract events as a strict JSON array. `calendar-scheduler.js` stores OAuth credentials and tokens in `electron-store` and calls `google.calendar('v3').events.insert`. Models can be bundled into the installer via `extraResources` so the user doesn't have to download multi-gigabyte weights on first run.

## Status

Built in October 2025 — last commit 2025-10-17 ("Implement calendar scheduling and speaker diarization features"). ~175 KB of JS + Python, electron-builder ships NSIS + portable Windows, DMG macOS, AppImage Linux. Personal utility, not distributed.
