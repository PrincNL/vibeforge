import { loadConfig } from "@/lib-config";

type GithubConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
};

function getConfigFromRuntime(): GithubConfig {
  const cfg = loadConfig();
  return {
    token: process.env.GITHUB_TOKEN || cfg.github?.token || "",
    owner: process.env.GITHUB_OWNER || cfg.github?.owner || "",
    repo: process.env.GITHUB_REPO || cfg.github?.repo || "",
    branch: process.env.GITHUB_BRANCH || cfg.github?.branch || "main",
  };
}

export async function validateGithubConnection() {
  const conf = getConfigFromRuntime();
  if (!conf.token || !conf.owner || !conf.repo) {
    return { ok: false, message: "Missing GitHub token/owner/repo." };
  }

  const headers = {
    Authorization: `Bearer ${conf.token}`,
    Accept: "application/vnd.github+json",
  };

  const userRes = await fetch("https://api.github.com/user", { headers, cache: "no-store" });
  if (!userRes.ok) return { ok: false, message: "Invalid GitHub token." };
  const user = await userRes.json();

  const repoRes = await fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}`, {
    headers,
    cache: "no-store",
  });
  if (!repoRes.ok) return { ok: false, message: "Repo not found or no access." };

  return {
    ok: true,
    login: user.login,
    owner: conf.owner,
    repo: conf.repo,
    branch: conf.branch,
  };
}

export async function pushGeneratedCode(params: {
  content: string;
  path: string;
  message?: string;
}) {
  const conf = getConfigFromRuntime();
  if (!conf.token || !conf.owner || !conf.repo) {
    throw new Error("GitHub is not configured.");
  }

  const headers = {
    Authorization: `Bearer ${conf.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const encodedPath = encodeURIComponent(params.path);
  const getUrl = `https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/${encodedPath}?ref=${conf.branch}`;

  let sha: string | undefined;
  const existing = await fetch(getUrl, { headers, cache: "no-store" });
  if (existing.ok) {
    const existingData = await existing.json();
    sha = existingData.sha;
  }

  const putUrl = `https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/${encodedPath}`;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: params.message || `feat: update ${params.path} from VibeForge`,
      content: Buffer.from(params.content, "utf8").toString("base64"),
      branch: conf.branch,
      sha,
    }),
  });

  if (!putRes.ok) {
    const txt = await putRes.text();
    throw new Error(`GitHub push failed: ${txt}`);
  }

  const data = await putRes.json();
  return {
    ok: true,
    commit: data.commit?.sha?.slice(0, 7),
    url: data.content?.html_url,
    path: params.path,
    branch: conf.branch,
  };
}
