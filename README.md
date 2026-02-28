# VibeForge

A modern, local-first **Codex/ChatGPT-style coding app** built with Next.js.

## Highlights

- Modern 3-panel UI (threads, chat, code/actions)
- Theme system (Midnight, Ocean, Sunset, Forest)
- First-run onboarding wizard (no manual env editing required)
- Full in-app Settings panel (reconfigure everything any time)
- OpenAI chat integration + model selector
- GitHub connection + one-click push of generated code snippets
- One-click app updater (check + update)
- Autonomous mode (safe/high-risk) + proactive mode toggles

## Quick start

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

> First launch opens onboarding automatically.

## Docker

```bash
docker compose up -d --build
```

## Config storage

Onboarding/settings are stored locally in:

- `config/onboarding.json`

This file is intentionally gitignored.

## Core API routes

- `GET /api/setup/status`
- `POST /api/setup/save`
- `POST /api/chat`
- `POST /api/github/connect`
- `POST /api/github/push`
- `GET /api/update/status`
- `POST /api/update/apply`
- `POST /api/autonomy/run`
- `GET /api/health`

## Autonomous mode warning

High-risk autonomous mode can execute AI-generated shell commands when enabled. Use only in trusted environments.
