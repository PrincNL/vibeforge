# VibeForge

A local-first, open-source **Codex-style coding cockpit** built with Next.js.

## Zero-manual setup

You no longer need to manually edit `.env`.
On first launch, VibeForge opens a built-in onboarding wizard where users configure:
- Auth mode (Local mode or OpenAI OAuth)
- OpenAI API key
- Auto-updater settings (repo path/branch/restart command/token)

Settings are stored in:
- `config/onboarding.json`

---

## Run with Docker

```bash
docker compose up -d --build
```

Open: http://localhost:3000

## Run with Node.js

```bash
npm install
npm run dev
```

---

## Built-in updater

The app includes **Check** + **Update now** in the sidebar:
1. Check compares local SHA vs `origin/<branch>`
2. Update applies:
   - `git fetch`
   - `git reset --hard origin/<branch>`
   - `npm install`
   - `npm run build`
   - optional restart command

---

## Endpoints

- `GET /api/health`
- `GET /api/setup/status`
- `POST /api/setup/save`
- `GET /api/update/status`
- `POST /api/update/apply`

---

## Optional env overrides

You can still use env vars (see `.env.example`), but they are no longer required for first-run onboarding.
