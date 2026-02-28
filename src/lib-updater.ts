import { exec } from "node:child_process";
import { promisify } from "node:util";

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

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const repoPath = process.env.APP_REPO_PATH || process.cwd();
  const branch = process.env.APP_UPDATE_BRANCH || "main";

  try {
    const { stdout: currentRaw } = await execAsync("git rev-parse HEAD", { cwd: repoPath });
    const current = currentRaw.trim();

    await execAsync(`git fetch origin ${branch}`, { cwd: repoPath });
    const { stdout: remoteRaw } = await execAsync(`git rev-parse origin/${branch}`, {
      cwd: repoPath,
    });
    const remote = remoteRaw.trim();

    return {
      ok: true,
      current: shortSha(current),
      remote: shortSha(remote),
      hasUpdate: current !== remote,
      branch,
      repoPath,
    };
  } catch (error) {
    return {
      ok: false,
      current: "unknown",
      remote: "unknown",
      hasUpdate: false,
      branch,
      repoPath,
      message: error instanceof Error ? error.message : "Failed to check updates",
    };
  }
}

export async function applyUpdate() {
  const repoPath = process.env.APP_REPO_PATH || process.cwd();
  const branch = process.env.APP_UPDATE_BRANCH || "main";

  await execAsync(`git fetch origin ${branch}`, { cwd: repoPath });
  await execAsync(`git reset --hard origin/${branch}`, { cwd: repoPath });
  await execAsync("npm install", { cwd: repoPath });
  await execAsync("npm run build", { cwd: repoPath });

  const restartCmd = process.env.APP_RESTART_COMMAND;
  if (restartCmd) {
    await execAsync(restartCmd, { cwd: repoPath });
  }

  return {
    ok: true,
    restarted: Boolean(restartCmd),
    message: restartCmd
      ? "Update applied and restart command executed."
      : "Update applied. Restart your app process to use the new version.",
  };
}
