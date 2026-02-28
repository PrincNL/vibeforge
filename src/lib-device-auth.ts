import { spawn, spawnSync } from "node:child_process";
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
  outputBuffer?: string;
};

const sessions = new Map<string, Session>();
const TTL_MS = 2 * 60 * 1000;

function stripAnsi(input: string) {
  return input.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").replace(/\x1B\][^\x07]*\x07/g, "");
}

function extractDeviceCode(text: string): string | null {
  const cleaned = stripAnsi(text);

  const explicitMatch = cleaned.match(/one-time code[^\n]*\n\s*([A-Z0-9]{4}-[A-Z0-9]{4,6}|[A-Z0-9]{9})/i);
  if (explicitMatch?.[1]) return explicitMatch[1].toUpperCase();

  const genericMatch = cleaned.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4,6}|[A-Z0-9]{9})\b/);
  if (genericMatch?.[1]) return genericMatch[1].toUpperCase();

  return null;
}

function cleanup() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > TTL_MS) {
      try {
        s.process?.kill();
      } catch {}
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

function isCodexAvailable() {
  const check = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(check, ["codex"], { stdio: "ignore", shell: true });
  return res.status === 0;
}

export function startDeviceAuth() {
  cleanup();

  const id = randomUUID();
  const sess: Session = { id, status: "pending", createdAt: Date.now(), outputBuffer: "" };
  sessions.set(id, sess);

  if (!isCodexAvailable()) {
    sess.status = "failed";
    sess.error =
      "Codex CLI not found in PATH. Install with: npm i -g @openai/codex, then restart VibeForge.";
    return { id: sess.id, url: "https://auth.openai.com/codex/device", code: "" };
  }

  const child = spawn("codex", ["login", "--device-auth"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    shell: process.platform === "win32",
  });
  sess.process = child;

  const onData = (chunk: Buffer) => {
    const text = stripAnsi(chunk.toString("utf8"));
    sess.outputBuffer = `${sess.outputBuffer || ""}${text}`.slice(-12000);

    if ((sess.outputBuffer || "").includes("https://auth.openai.com/codex/device")) {
      sess.url = "https://auth.openai.com/codex/device";
    }

    const code = extractDeviceCode(sess.outputBuffer || text);
    if (code) sess.code = code;

    if ((sess.outputBuffer || "").includes("Enable device code authorization for Codex in ChatGPT Security Settings")) {
      sess.status = "failed";
      sess.error =
        "Enable device code authorization in ChatGPT Security Settings first, then click Connect again.";
      try {
        child.kill();
      } catch {}
    }
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("error", (err) => {
    sess.status = "failed";
    sess.error = err.message;
  });

  child.on("exit", (code) => {
    if (sess.status === "failed") return;

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
      sess.error = "Connection timed out after 60 seconds. Try again.";
      try {
        child.kill();
      } catch {}
    }
  }, 60_000);

  return {
    id: sess.id,
    url: sess.url || "https://auth.openai.com/codex/device",
    code: sess.code || "",
  };
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
