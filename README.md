# VibeForge

A local-first, open-source **Codex-style desktop app**.

## Development (desktop app)

```bash
npm install
npm run dev
```

`npm run dev` now launches a **real desktop window** (Electron), not a browser tab.
The desktop app hosts the internal local runtime on `http://localhost:3210`.

## Production runtime

```bash
npm run build
npm run start:desktop
```

## OAuth status

- One-click OpenAI connect flow is implemented.
- If OpenAI dynamic registration is blocked in your network (Cloudflare challenge), use the device-auth fallback path (next patch).

## Endpoints

- `GET /api/health`
- `GET /api/setup/status`
- `POST /api/setup/save`
- `GET /api/update/status`
- `POST /api/update/apply`
- `POST /api/github/connect`
- `POST /api/github/push`
- `POST /api/autonomy/run`
- `GET /api/oauth/openai/start`
- `GET /api/oauth/openai/callback`
- `POST /api/oauth/openai/disconnect`
