import OpenAI from "openai";
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib-config";
import { promisify } from "node:util";
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

function resolveCodexCommand(): { cmd: string; argsPrefix: string[] } | null {
  const custom = process.env.CODEX_CLI_PATH;
  if (custom) return { cmd: custom, argsPrefix: [] };

  const finder = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(finder, ["codex"], { encoding: "utf8", shell: process.platform === "win32" });
  if (found.status === 0 && found.stdout) {
    const first = found.stdout.split(/\r?\n/).find(Boolean)?.trim();
    if (first) return { cmd: first, argsPrefix: [] };
  }

  // fallback without global install
  return {
    cmd: process.platform === "win32" ? "npx.cmd" : "npx",
    argsPrefix: ["-y", "@openai/codex"],
  };
}

async function runViaCodex(prompt: string, reasoning: string) {
  const outFile = path.join("/tmp", `vibeforge-codex-${Date.now()}.txt`);

  const effortMap: Record<string, string> = {
    off: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
  };

  const resolved = resolveCodexCommand();
  if (!resolved) throw new Error("Codex CLI not found. Install with: npm i -g @openai/codex");

  await execFileAsync(
    resolved.cmd,
    [
      ...resolved.argsPrefix,
      "exec",
      "--skip-git-repo-check",
      "-m",
      "gpt-5.3-codex",
      "-c",
      `model_reasoning_effort=\"${effortMap[reasoning] || "low"}\"`,
      "-o",
      outFile,
      prompt,
    ],
    { timeout: 180000, shell: process.platform === "win32" },
  );

  const text = await fs.readFile(outFile, "utf8");
  await fs.unlink(outFile).catch(() => {});
  return text.trim();
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

  // Preferred: direct OpenAI API key
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

  // Fallback: use codex account session (device auth)
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
