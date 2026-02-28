import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

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

let activeChild: ChildProcess | null = null;

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
  if (activeChild && !activeChild.killed) {
    activeChild.kill("SIGTERM");
    setTimeout(() => {
      if (activeChild && !activeChild.killed) activeChild.kill("SIGKILL");
    }, 1500);
  }
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

async function execCommand(command: string, cwd: string) {
  return await new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeChild = child;

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
    }, 120000);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });

    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      activeChild = null;
      const output = `${stdout}\n${stderr}`.trim().slice(0, 6000);
      resolve({ ok: code === 0, output });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      activeChild = null;
      resolve({ ok: false, output: error.message || "spawn failed" });
    });
  });
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
      if (state.stopRequested) {
        push("info", "Stop requested; halting remaining commands.");
        break;
      }

      if (commandLooksUnsafe(command)) {
        push("error", `Blocked unsafe command: ${command}`);
        results.push({ command, output: "Blocked unsafe command", ok: false });
        continue;
      }

      state.currentCommand = command;
      push("command", command);

      const first = await execCommand(command, targetDir);
      if (first.ok) {
        results.push({ command, output: first.output, ok: true });
        push("info", `Command succeeded: ${command}`);
      } else {
        push("error", `Command failed: ${command}`);
        push("info", `Retrying once: ${command}`);

        const retry = await execCommand(command, targetDir);
        if (retry.ok) {
          results.push({ command, output: retry.output, ok: true });
          push("info", `Recovered on retry: ${command}`);
        } else {
          results.push({ command, output: `${first.output}\n\nRetry failed:\n${retry.output}`.trim().slice(0, 6000), ok: false });
          push("error", `Retry failed: ${command}`);
        }
      }

      state.currentCommand = null;
    }
  } finally {
    state.running = false;
    state.currentCommand = null;
    activeChild = null;
    if (!state.stopRequested) {
      state.status = "idle";
      push("info", "Autonomous run finished");
    }
  }

  return results;
}
