---
name: "su2re"
role: author
visibility: private
description: "Transcripteur Electron : faster-whisper + diarisation pyannote, push-to-talk, nettoyage GPT-4o-mini, Google Calendar."
year: 2025
last_active: "2025-10"
language: "JavaScript"
code_bytes: 174522
archived: false
tags: [ai, desktop, python]
---

su2re est un transcripteur Electron multiplateforme couplé à un backend Python. Le processus main Electron enregistre un raccourci global push-to-talk et lance un des trois points d'entrée Python — `transcriber_backend.py` pour la transcription brute, `..._diarization.py` pour `pyannote/speaker-diarization-community-1` au-dessus de `faster-whisper`, ou `streaming_transcriber.py` — la communication passant par des lignes `STATUS:` sur stdout. Côté JS, `ai-improver.js` appelle OpenAI `gpt-4o-mini` pour nettoyer les transcriptions et extraire les événements de calendrier en JSON ; `calendar-scheduler.js` enveloppe `googleapis` pour s'OAuth dans Google Calendar et y insérer les événements. Cibles Windows NSIS/portable, macOS DMG, Linux AppImage via electron-builder.
