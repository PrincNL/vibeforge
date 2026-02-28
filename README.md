# VibeForge

Open-source “vibe coding” app in Next.js met:
- OpenAI OAuth login (Auth.js custom OAuth provider)
- Bring-your-own OpenAI API key per user
- Chat + live code pane UI
- Dockerfile + docker-compose

## Quick start

```bash
cp .env.example .env
# vul OAuth vars in
npm install
npm run dev
```

Open op http://localhost:3000

## Docker

```bash
docker compose up -d --build
```

## Belangrijk

Deze app gebruikt **jouw eigen OpenAI OAuth app credentials** en **jouw eigen API key**.
