# VibeForge

A local-first, open-source **Codex-style coding cockpit** built with Next.js.

## First run (no manual env editing)

On first launch, the onboarding wizard configures everything in-app:
- Theme
- Auth mode (Local mode or OpenAI OAuth)
- OpenAI API key
- GitHub integration
- Auto updater settings
- Proactive + Autonomous mode settings

Settings are stored in: `config/onboarding.json` (local runtime file).

---

## OpenAI OAuth (simple flow)

You only need:
- OAuth Client ID
- OAuth Client Secret

In onboarding/settings, VibeForge shows the exact callback URL you must add in your OpenAI OAuth app:

`<your-app-url>/api/auth/callback/openai`

Then click **Continue with OpenAI** and sign in on OpenAI page.

---

## Run with Docker

```bash
docker compose up -d --build
```

## Run with Node.js

```bash
npm install
npm run dev
```

---

## Built-in updater

- Check compares local SHA with remote branch
- Update now runs fetch/reset/install/build (+ optional restart command)

---

## Endpoints

- `GET /api/health`
- `GET /api/setup/status`
- `POST /api/setup/save`
- `GET /api/update/status`
- `POST /api/update/apply`
- `POST /api/github/connect`
- `POST /api/github/push`
- `POST /api/autonomy/run`
