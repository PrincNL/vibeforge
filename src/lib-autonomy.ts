import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";

const execAsync = promisify(exec);

type Activity = { ts: string; type: "info" | "command" | "error"; text: string };

type RunStatus = "idle" | "running" | "stopped";

type AutonomyState = {
  status: RunStatus;
  running: boolean;
  stopRequested: boolean;
  workspaceRoot: string;
  installRoot: string;
  currentCommand: string | null;
  activities: Activity[];
};

const state: AutonomyState = {
  status: "idle",
  running: false,
  stopRequested: false,
  workspaceRoot: process.cwd(),
  installRoot: process.cwd(),
  currentCommand: null,
  activities: [],
};

function push(type: Activity["type"], text: string) {
  state.activities.unshift({ ts: new Date().toISOString(), type, text });
  state.activities = state.activities.slice(0, 200);
}

export function setWorkspaceRoot(root: string) {
  const resolved = path.resolve(root || process.cwd());
  state.workspaceRoot = resolved;
  push("info", `Workspace root set to ${resolved}`);
}

export function getAutonomyState() {
  return { ...state, activities: [...state.activities] };
}

export function requestStop() {
  state.stopRequested = true;
  state.running = false;
  state.status = "stopped";
  state.currentCommand = null;
  push("info", "Emergency stop requested");
}

function isPathInside(child: string, parent: string) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function commandLooksUnsafe(cmd: string) {
  const lower = cmd.toLowerCase();
  const dangerous = ["format ", "diskpart", "shutdown", "reg delete", "del /f /s /q c:\\", "rm -rf /"];
  return dangerous.some((d) => lower.includes(d));
}

export async function runCommands(commands: string[], cwd?: string) {
  if (state.running) throw new Error("Autonomy already running");

  const targetDir = path.resolve(cwd || state.workspaceRoot);
  if (!isPathInside(targetDir, state.workspaceRoot)) {
    throw new Error("Target directory is outside workspace root");
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  state.running = true;
  state.status = "running";
  state.stopRequested = false;
  state.currentCommand = null;
  push("info", `Starting autonomous run in ${targetDir}`);

  const results: Array<{ command: string; output: string; ok: boolean }> = [];

  try {
    for (const command of commands) {
      if (state.stopRequested) break;

      if (commandLooksUnsafe(command)) {
        push("error", `Blocked unsafe command: ${command}`);
        results.push({ command, output: "Blocked unsafe command", ok: false });
        continue;
      }

      state.currentCommand = command;
      push("command", command);
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: targetDir, timeout: 120000 });
        const out = `${stdout}\n${stderr}`.slice(0, 5000);
        results.push({ command, output: out, ok: true });
        push("info", `Command ok: `);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        push("error", `Command failed:  :: `);
        push("info", `Retrying once: `);
        try {
          const retry = await execAsync(command, { cwd: targetDir, timeout: 120000 });
          const out = `\n`.slice(0, 5000);
          push("info", `Recovered on retry: `);
          results.push({ command, output: out, ok: true });
        } catch (retryError) {
          const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
          results.push({ command, output: `\nRetry failed: `, ok: false });
        }
      } finally {
        state.currentCommand = null;
      }
    }
  } finally {
    state.running = false;
    state.currentCommand = null;
    if (!state.stopRequested) {
      state.status = "idle";
      push("info", "Autonomous run finished");
    }
  }

  return results;
}
