import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadConfig, saveConfig } from "@/lib-config";

type Session = {
  id: string;
  url?: string;
  code?: string;
  status: "pending" | "success" | "failed" | "timeout";
  error?: string;
  createdAt: number;
  process?: ReturnType<typeof spawn>;
};

const sessions = new Map<string, Session>();
const TTL_MS = 2 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > TTL_MS) {
      try { s.process?.kill(); } catch {}
      sessions.delete(id);
    }
  }
}

function markConnected() {
  const cfg = loadConfig();
  saveConfig({
    ...cfg,
    oauth: {
      ...(cfg.oauth || {}),
      connected: true,
      email: cfg.oauth?.email || "OpenAI account",
    },
  });
}

export function startDeviceAuth() {
  cleanup();
  const id = randomUUID();
  const sess: Session = { id, status: "pending", createdAt: Date.now() };
  sessions.set(id, sess);

  const child = spawn("codex", ["login", "--device-auth"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  sess.process = child;

  const onData = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    const urlMatch = text.match(/https:\/\/auth\.openai\.com\/codex\/device/);
    if (urlMatch) sess.url = "https://auth.openai.com/codex/device";

    const codeMatch = text.match(/\b([A-Z0-9]{4}-[A-Z0-9]{5,6})\b/);
    if (codeMatch) sess.code = codeMatch[1];
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("exit", (code) => {
    if (code === 0) {
      sess.status = "success";
      markConnected();
    } else if (sess.status === "pending") {
      sess.status = "failed";
      sess.error = `codex login exited with code ${code}`;
    }
  });

  setTimeout(() => {
    if (sess.status === "pending") {
      sess.status = "timeout";
      sess.error = "Device auth timed out";
      try { child.kill(); } catch {}
    }
  }, 60_000);

  return { id: sess.id, url: sess.url || "https://auth.openai.com/codex/device", code: sess.code || "" };
}

export function getDeviceAuthStatus(id: string) {
  cleanup();
  const sess = sessions.get(id);
  if (!sess) return { ok: false, status: "missing", message: "Session not found" };
  return {
    ok: true,
    status: sess.status,
    url: sess.url,
    code: sess.code,
    error: sess.error,
  };
}
