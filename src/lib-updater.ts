import { exec } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig } from "@/lib-config";

const execAsync = promisify(exec);

export type UpdateStatus = {
  ok: boolean;
  current: string;
  remote: string;
  hasUpdate: boolean;
  branch: string;
  repoPath: string;
  message?: string;
};

function shortSha(value: string) {
  return value.trim().slice(0, 7);
}

function getUpdaterRuntime() {
  const cfg = loadConfig();
  return {
    repoPath: process.env.APP_REPO_PATH || cfg.updater?.repoPath || process.cwd(),
    branch: process.env.APP_UPDATE_BRANCH || cfg.updater?.branch || "main",
    restartCmd: process.env.APP_RESTART_COMMAND || cfg.updater?.restartCommand || "",
    token: process.env.APP_UPDATE_TOKEN || cfg.updater?.token || "",
  };
}

const cleanEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production" as const,
  NEXT_TELEMETRY_DISABLED: "1",
};

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const runtime = getUpdaterRuntime();

  try {
    const { stdout: currentRaw } = await execAsync("git rev-parse HEAD", { cwd: runtime.repoPath, env: cleanEnv });
    const current = currentRaw.trim();

    await execAsync(`git fetch origin ${runtime.branch}`, { cwd: runtime.repoPath, env: cleanEnv });
    const { stdout: remoteRaw } = await execAsync(`git rev-parse origin/${runtime.branch}`, {
      cwd: runtime.repoPath,
      env: cleanEnv,
    });
    const remote = remoteRaw.trim();

    return {
      ok: true,
      current: shortSha(current),
      remote: shortSha(remote),
      hasUpdate: current !== remote,
      branch: runtime.branch,
      repoPath: runtime.repoPath,
    };
  } catch (error) {
    return {
      ok: false,
      current: "unknown",
      remote: "unknown",
      hasUpdate: false,
      branch: runtime.branch,
      repoPath: runtime.repoPath,
      message: error instanceof Error ? error.message : "Failed to check updates",
    };
  }
}

export async function applyUpdate() {
  const runtime = getUpdaterRuntime();

  try {
    await execAsync(`git fetch origin ${runtime.branch}`, { cwd: runtime.repoPath, env: cleanEnv });
    await execAsync(`git reset --hard origin/${runtime.branch}`, { cwd: runtime.repoPath, env: cleanEnv });
    await execAsync("npm install", { cwd: runtime.repoPath, env: cleanEnv });
    await execAsync("npm run build", { cwd: runtime.repoPath, env: cleanEnv });
  } catch (firstError) {
    // Self-heal attempt: clear install state and retry cleanly
    await execAsync("npm cache verify", { cwd: runtime.repoPath, env: cleanEnv }).catch(() => {});
    await execAsync("npm install --force", { cwd: runtime.repoPath, env: cleanEnv });
    await execAsync("npm run build", { cwd: runtime.repoPath, env: cleanEnv });

    if (firstError instanceof Error) {
      // keep first error context in message trail when success after retry
      console.warn("[updater] First attempt failed, recovered on retry:", firstError.message);
    }
  }

  if (runtime.restartCmd) {
    await execAsync(runtime.restartCmd, { cwd: runtime.repoPath, env: cleanEnv });
  }

  return {
    ok: true,
    restarted: Boolean(runtime.restartCmd),
    message: runtime.restartCmd
      ? "Update applied and restart command executed."
      : "Update applied. Restart your app process to use the new version.",
  };
}

export function getUpdaterToken() {
  return getUpdaterRuntime().token;
}
