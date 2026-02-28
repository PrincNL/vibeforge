import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

export type CodexCandidate = { cmd: string; argsPrefix: string[]; useShell: boolean; source: string };
export type CodexRunResult = { text: string; commandTried: string };

function pushIfExists(candidates: CodexCandidate[], cmd: string, source: string, argsPrefix: string[] = [], useShell = false) {
  if (fsSync.existsSync(cmd)) {
    candidates.push({ cmd, argsPrefix, useShell, source });
  }
}

export function detectCodexCandidates(): CodexCandidate[] {
  const candidates: CodexCandidate[] = [];
  const isWin = process.platform === "win32";

  const custom = process.env.CODEX_CLI_PATH;
  if (custom) {
    if (isWin) {
      if (path.extname(custom)) {
        candidates.push({ cmd: custom, argsPrefix: [], useShell: true, source: "CODEX_CLI_PATH" });
      } else {
        pushIfExists(candidates, `${custom}.cmd`, "CODEX_CLI_PATH+.cmd", [], true);
        pushIfExists(candidates, `${custom}.bat`, "CODEX_CLI_PATH+.bat", [], true);
        pushIfExists(candidates, `${custom}.exe`, "CODEX_CLI_PATH+.exe", [], false);
        pushIfExists(candidates, custom, "CODEX_CLI_PATH", [], true);
      }
    } else {
      candidates.push({ cmd: custom, argsPrefix: [], useShell: false, source: "CODEX_CLI_PATH" });
    }
  }

  const finder = isWin ? "where" : "which";
  const found = spawnSync(finder, ["codex"], { encoding: "utf8", shell: isWin });
  if (found.status === 0 && found.stdout) {
    const lines = found.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      if (isWin) {
        const ext = path.extname(line).toLowerCase();
        if (ext) {
          candidates.push({ cmd: line, argsPrefix: [], useShell: ext === ".cmd" || ext === ".bat", source: "where codex" });
        } else {
          pushIfExists(candidates, `${line}.cmd`, "where codex + .cmd", [], true);
          pushIfExists(candidates, `${line}.bat`, "where codex + .bat", [], true);
          pushIfExists(candidates, `${line}.exe`, "where codex + .exe", [], false);
        }
      } else {
        candidates.push({ cmd: line, argsPrefix: [], useShell: false, source: "which codex" });
      }
    }
  }

  candidates.push({ cmd: "codex", argsPrefix: [], useShell: isWin, source: "PATH codex" });
  candidates.push({ cmd: isWin ? "npx.cmd" : "npx", argsPrefix: ["-y", "@openai/codex"], useShell: isWin, source: "npx fallback" });

  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.cmd}|${c.argsPrefix.join(" ")}|${c.useShell}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runWithCandidate(candidate: CodexCandidate, prompt: string, reasoning: string, outFile: string) {
  const effortMap: Record<string, string> = { off: "minimal", low: "low", medium: "medium", high: "high" };
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
    const child = spawn(candidate.cmd, args, { shell: candidate.useShell, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(stderr || `${candidate.cmd} exited with code ${code}`));
    });
    child.stdin.write(prompt || "Help me with this task.");
    child.stdin.end();
  });
}

export async function runViaCodex(prompt: string, reasoning: string): Promise<CodexRunResult> {
  const outFile = path.join(os.tmpdir(), `vibeforge-codex-${Date.now()}.txt`);
  const candidates = detectCodexCandidates();
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      await runWithCandidate(c, prompt, reasoning, outFile);
      const text = await fs.readFile(outFile, "utf8");
      await fs.unlink(outFile).catch(() => {});
      return { text: text.trim(), commandTried: `${c.cmd} ${c.argsPrefix.join(" ")}`.trim() };
    } catch (err) {
      errors.push(`${c.source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(
    [
      "No working Codex executable detected.",
      "Fix options:",
      "1) Install globally: npm i -g @openai/codex",
      "2) Or set CODEX_CLI_PATH to codex(.cmd/.exe)",
      "3) Ensure npx works in this runtime",
      `Tried ${candidates.length} candidates.`,
      ...errors.slice(-4),
    ].join("\n"),
  );
}

export async function codexSelfTest() {
  const candidates = detectCodexCandidates();
  const checks = candidates.slice(0, 6).map((c) => {
    const args = [...c.argsPrefix, "--help"];
    const probe = spawnSync(c.cmd, args, { encoding: "utf8", shell: c.useShell, timeout: 12000 });
    return {
      candidate: `${c.cmd} ${c.argsPrefix.join(" ")}`.trim(),
      source: c.source,
      ok: probe.status === 0,
      status: probe.status,
      error: probe.error?.message || (probe.status === 0 ? "" : (probe.stderr || "failed").slice(0, 240)),
    };
  });

  const working = checks.find((c) => c.ok);
  return {
    ok: Boolean(working),
    working: working?.candidate || null,
    candidates: checks,
  };
}
