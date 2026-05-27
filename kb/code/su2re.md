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
