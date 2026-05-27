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

## What

On presse Ctrl+Shift+Space depuis n'importe où sur le desktop, on parle, on relâche : l'audio est transcrit localement et atterrit en texte dans l'onglet actif. On dépose un fichier audio (MP3/WAV/M4A/FLAC/OGG/OPUS/MP4/AVI/MKV) sur l'app pour une transcription plus longue avec choix de taille de modèle (tiny à large-v2). Avec la diarisation activée, les speakers sortent codés couleur et leurs labels sont éditables. L'onglet IA propose des presets de nettoyage (ton pro, concis, bullets, résumé) ; l'onglet calendrier extrait les événements de la transcription, demande confirmation à l'utilisateur, puis les insère dans le calendrier Google principal.

## Tech

Architecture en deux processus : `main.js` Electron porte le cycle de vie, `globalShortcut.register`, `spawn('python', ...)` et parse les lignes `STATUS:` + payloads sur stdout ; les renderers (`renderer.js`, `renderer-tabs.js`, `renderer-diarization.js`, `renderer-improvement.js`, `renderer-calendar.js`) découpent l'UI par feature. Côté Python, `faster-whisper` pour l'inférence Whisper et `pyannote.audio` avec `speaker-diarization-community-1` pour la diarisation, tous deux 100 % locaux. `ai-improver.js` appelle OpenAI `gpt-4o-mini` deux fois en mode calendrier — une pour nettoyer, une pour extraire les événements en tableau JSON strict. `calendar-scheduler.js` stocke credentials et tokens OAuth dans `electron-store` et appelle `google.calendar('v3').events.insert`. Les modèles peuvent être bundlés dans l'installeur via `extraResources` pour éviter à l'utilisateur de télécharger plusieurs gigaoctets au premier lancement.

## Status

Construit en octobre 2025 — dernier commit 2025-10-17 (« Implement calendar scheduling and speaker diarization features »). ~175 Ko de JS + Python, electron-builder produit du NSIS + portable Windows, DMG macOS, AppImage Linux. Utilitaire personnel, non distribué.
