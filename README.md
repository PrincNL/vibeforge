# VibeForge

A local-first, open-source **Codex-style coding cockpit** built with Next.js.

## What you get

- Codex-like 3-panel layout (threads, chat, tools/code pane)
- OpenAI-powered coding chat via Responses API
- OpenAI OAuth login support (Auth.js custom OAuth provider)
- Local dev bypass mode (run without OAuth while building locally)
- **Built-in updater UI** (Check + Update now button)
- Dockerfile + docker-compose for one-command startup
- Health endpoint: `GET /api/health`

---

## 1) Run locally with Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open: http://localhost:3000

---

## 2) Run with Node.js

```bash
cp .env.example .env
npm install
npm run dev
```

---

## Auth modes

### A) Local mode (works immediately)

```env
DEV_BYPASS_LOGIN=true
NEXT_PUBLIC_DEV_BYPASS_LOGIN=true
```

You can still provide OpenAI API key in the UI, or set `OPENAI_API_KEY` in `.env`.

### B) OpenAI OAuth mode

```env
DEV_BYPASS_LOGIN=false
NEXT_PUBLIC_DEV_BYPASS_LOGIN=false
OPENAI_OAUTH_ISSUER=...
OPENAI_OAUTH_CLIENT_ID=...
OPENAI_OAUTH_CLIENT_SECRET=...
OPENAI_OAUTH_AUTH_URL=...
OPENAI_OAUTH_TOKEN_URL=...
OPENAI_OAUTH_USERINFO_URL=...
```

---

## Auto-update button setup

The app can check if `origin/main` has new commits and apply updates from the UI.

### Required
- The app must run from a real git clone of the repo.
- Git remote `origin` must exist.

### Optional env

```env
APP_REPO_PATH=/path/to/vibeforge
APP_UPDATE_BRANCH=main
APP_RESTART_COMMAND=pm2 restart vibeforge
APP_UPDATE_TOKEN=your_secret_token
```

- `APP_REPO_PATH`: repo location (default: current working directory)
- `APP_RESTART_COMMAND`: command executed after update (optional)
- `APP_UPDATE_TOKEN`: if set, Update API requires this token from UI

### Updater behavior
1. `Check` fetches origin and compares local SHA vs remote SHA.
2. `Update now` performs:
   - `git fetch`
   - `git reset --hard origin/<branch>`
   - `npm install`
   - `npm run build`
   - optional restart command

---

## Verify everything

- App UI: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Build check: `npm run build`
- Update status: `GET /api/update/status`

---

## Project goal

Recreate the Codex app experience in a self-hosted Node.js/Next.js app that users can run locally with minimal setup.
