# VibeForge

A local-first, open-source **Codex-style coding cockpit** built with Next.js.

## What you get

- Codex-like 3-panel layout (threads, chat, tools/code pane)
- OpenAI-powered coding chat via Responses API
- OpenAI OAuth login support (Auth.js custom OAuth provider)
- Local dev bypass mode (run without OAuth while building locally)
- Dockerfile + docker-compose for one-command startup
- Health endpoint: `GET /api/health`

---

## 1) Run locally with Docker (fastest)

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
Use this in `.env`:

```env
DEV_BYPASS_LOGIN=true
NEXT_PUBLIC_DEV_BYPASS_LOGIN=true
```

You can still provide OpenAI API key in the UI, or set `OPENAI_API_KEY` in `.env`.

### B) OpenAI OAuth mode
Use this in `.env`:

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

> Note: OAuth only works when your OpenAI OAuth app credentials are valid and correctly configured.

---

## Verify everything

- App UI: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Build check: `npm run build`

---

## Project goal

Recreate the Codex app experience in a self-hosted Node.js/Next.js app that users can run locally with minimal setup.
