import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";

const execAsync = promisify(exec);

type Activity = { ts: string; type: "info" | "command" | "error"; text: string };

type AutonomyState = {
  running: boolean;
  stopRequested: boolean;
  workspaceRoot: string;
  activities: Activity[];
};

const state: AutonomyState = {
  running: false,
  stopRequested: false,
  workspaceRoot: process.cwd(),
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
    throw new Error("Target directory is outside install/workspace root");
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  state.running = true;
  state.stopRequested = false;
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

      push("command", command);
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: targetDir, timeout: 120000 });
        const out = `${stdout}\n${stderr}`.slice(0, 5000);
        results.push({ command, output: out, ok: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        push("error", `Command failed: ${command} :: ${msg}`);
        results.push({ command, output: msg, ok: false });
      }
    }
  } finally {
    state.running = false;
    if (!state.stopRequested) push("info", "Autonomous run finished");
  }

  return results;
}
