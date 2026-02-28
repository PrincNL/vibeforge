# VibeForge

A local-first, open-source **Codex-style desktop app** with practical remote operations over **Tailscale**.

## Development (desktop app)

```bash
npm install
npm run dev
```

`npm run dev` launches Electron + local Next runtime (`http://localhost:3210`).

## Production runtime

```bash
npm run build
npm run start:desktop
```

## Universal deployment (cross-machine)

### 1) Install + run on any host

```bash
git clone https://github.com/PrincNL/vibeforge.git
cd vibeforge
npm install
npm run build
npm run start:web
```

### 2) Add to Tailscale

```bash
sudo tailscale up --ssh
```

Then use the host's tailnet IP or DNS name (shown in **Tailscale Connectivity** panel).

### 3) Secure remote control defaults

Use `.env` (or process manager env):

```bash
VIBEFORGE_REMOTE_TOKEN=replace-with-long-random-token
```

By default VibeForge now uses safe remote posture:

- `remoteTailnetOnly: true` (remote autonomy requests must be from tailnet IP ranges)
- `requireRemoteToken: true` (`x-vf-remote-token` required for remote autonomy start/stop)
- `allowCommandExecution: false` (planner can propose commands; no execution until explicitly enabled)

## Tailscale panel + preflight

The UI now includes:

- **Tailscale Connectivity** panel
  - Backend state
  - Tailnet IP
  - Relay path (direct/DERP when detectable)
  - Online peers
  - Actionable suggestions
- **E2E Preflight** panel
  - Live runtime checks
  - One-click guidance/fixes (diagnostics endpoints)
  - Safe defaults hardening button

## Endpoints

- `GET /api/health`
- `GET /api/setup/status`
- `POST /api/setup/save`
- `GET /api/update/status`
- `POST /api/update/apply`
- `GET /api/tailscale/status`
- `GET /api/diagnostics`
- `POST /api/diagnostics/fix`
- `POST /api/autonomy/run`
- `GET /api/oauth/openai/start`
- `GET /api/oauth/openai/callback`
- `POST /api/oauth/openai/disconnect`
