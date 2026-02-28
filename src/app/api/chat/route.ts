import OpenAI from "openai";
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib-config";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import fsSync from "node:fs";

type CmdCandidate = { cmd: string; argsPrefix: string[]; useShell: boolean };

function buildCodexCandidates(): CmdCandidate[] {
  const candidates: CmdCandidate[] = [];

  const custom = process.env.CODEX_CLI_PATH;
  if (custom) {
    candidates.push({ cmd: custom, argsPrefix: [], useShell: process.platform === "win32" });
  }

  const finder = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(finder, ["codex"], { encoding: "utf8", shell: process.platform === "win32" });
  if (found.status === 0 && found.stdout) {
    const lines = found.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const line of lines) {
      // direct path from where/which
      candidates.push({ cmd: line, argsPrefix: [], useShell: process.platform === "win32" });

      // windows shim variants
      if (process.platform === "win32" && !line.toLowerCase().endsWith(".cmd")) {
        const cmdVariant = `${line}.cmd`;
        if (fsSync.existsSync(cmdVariant)) {
          candidates.push({ cmd: cmdVariant, argsPrefix: [], useShell: true });
        }
      }
    }
  }

  // plain command name
  candidates.push({ cmd: "codex", argsPrefix: [], useShell: process.platform === "win32" });

  // npx fallback
  candidates.push({
    cmd: process.platform === "win32" ? "npx.cmd" : "npx",
    argsPrefix: ["-y", "@openai/codex"],
    useShell: process.platform === "win32",
  });

  // dedupe
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.cmd}|${c.argsPrefix.join(" ")}|${c.useShell}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function tryCodex(candidate: CmdCandidate, prompt: string, reasoning: string, outFile: string) {
  const effortMap: Record<string, string> = {
    off: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
  };

  const args = [
    ...candidate.argsPrefix,
    "exec",
    "--skip-git-repo-check",
    "-m",
    "gpt-5.3-codex",
    "-c",
    `model_reasoning_effort=\"${effortMap[reasoning] || "low"}\"`,
    "-o",
    outFile,
    "-",
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(candidate.cmd, args, {
      shell: candidate.useShell,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(stderr || `codex exited with code ${code}`));
    });

    child.stdin.write(prompt || "Help me with this task.");
    child.stdin.end();
  });
}

async function runViaCodex(prompt: string, reasoning: string) {
  const outFile = path.join("/tmp", `vibeforge-codex-${Date.now()}.txt`);
  const candidates = buildCodexCandidates();

  let lastError: unknown = null;
  for (const c of candidates) {
    try {
      await tryCodex(c, prompt, reasoning, outFile);
      const text = await fs.readFile(outFile, "utf8");
      await fs.unlink(outFile).catch(() => {});
      return text.trim();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? new Error(`No working codex executable found. Last error: ${lastError.message}`)
    : new Error("No working codex executable found.");
}

export async function POST(req: Request) {
  const cfg = loadConfig();

  if (cfg.authMode === "openai-oauth" && !cfg.oauth?.connected) {
    return NextResponse.json({ error: "Connect with OpenAI first." }, { status: 401 });
  }

  const body = await req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const reasoning = String(body.reasoning || "low");
  const lastUser = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

  const apiKey = req.headers.get("x-openai-key") || cfg.openaiApiKey || process.env.OPENAI_API_KEY;

  if (apiKey) {
    const client = new OpenAI({ apiKey });
    const effort = (reasoning === "off" ? "minimal" : reasoning) as "minimal" | "low" | "medium" | "high";

    const response = await client.responses.create({
      model: "gpt-5.3-codex",
      input: messages,
      reasoning: { effort },
    });

    return NextResponse.json({ text: response.output_text || "" });
  }

  if (cfg.oauth?.connected) {
    try {
      const text = await runViaCodex(lastUser, reasoning);
      return NextResponse.json({ text });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `Codex session fallback failed: ${error.message}`
              : "Codex session fallback failed",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "No OpenAI API key configured and no active Codex account session." },
    { status: 400 },
  );
}
