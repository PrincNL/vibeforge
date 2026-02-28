import fs from "node:fs";
import path from "node:path";

export type AppConfig = {
  setupCompleted: boolean;
  authMode: "dev-bypass" | "openai-oauth";
  theme: "midnight" | "ocean" | "sunset" | "forest";
  openaiApiKey?: string;
  oauth?: {
    issuer?: string;
    clientId?: string;
    connected?: boolean;
    email?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    pendingState?: string;
    pendingCodeVerifier?: string;
    pendingRedirectUri?: string;
  };
  updater?: { repoPath?: string; branch?: string; restartCommand?: string; token?: string };
  github?: { token?: string; owner?: string; repo?: string; branch?: string; defaultPath?: string };
  modes?: {
    proactive?: boolean;
    autonomousEnabled?: boolean;
    autonomousRiskLevel?: "safe" | "high-risk";
    allowCommandExecution?: boolean;
  };
};

const CONFIG_DIR = path.join(process.cwd(), "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "onboarding.json");

const defaultConfig: AppConfig = {
  setupCompleted: false,
  authMode: "dev-bypass",
  theme: "midnight",
  openaiApiKey: "",
  oauth: { issuer: "https://auth.openai.com", connected: false },
  updater: { branch: "main" },
  github: { branch: "main", defaultPath: "generated/patch.ts" },
  modes: { proactive: false, autonomousEnabled: false, autonomousRiskLevel: "safe", allowCommandExecution: false },
};

export function loadConfig(): AppConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return defaultConfig;
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...defaultConfig,
      ...parsed,
      oauth: { ...defaultConfig.oauth, ...(parsed.oauth || {}) },
      updater: { ...defaultConfig.updater, ...(parsed.updater || {}) },
      github: { ...defaultConfig.github, ...(parsed.github || {}) },
      modes: { ...defaultConfig.modes, ...(parsed.modes || {}) },
    };
  } catch {
    return defaultConfig;
  }
}

export function saveConfig(input: AppConfig) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(input, null, 2));
}

export function getSafeConfig() {
  const cfg = loadConfig();
  return {
    setupCompleted: cfg.setupCompleted,
    authMode: cfg.authMode,
    theme: cfg.theme,
    hasOpenAIApiKey: Boolean(cfg.openaiApiKey),
    oauthConnected: Boolean(cfg.oauth?.connected),
    oauthEmail: cfg.oauth?.email || "",
    updater: {
      branch: cfg.updater?.branch || "main",
      repoPath: cfg.updater?.repoPath || process.cwd(),
      hasToken: Boolean(cfg.updater?.token),
      hasRestartCommand: Boolean(cfg.updater?.restartCommand),
    },
    github: {
      connected: Boolean(cfg.github?.token && cfg.github?.owner && cfg.github?.repo),
      owner: cfg.github?.owner || "",
      repo: cfg.github?.repo || "",
      branch: cfg.github?.branch || "main",
      defaultPath: cfg.github?.defaultPath || "generated/patch.ts",
    },
    modes: {
      proactive: Boolean(cfg.modes?.proactive),
      autonomousEnabled: Boolean(cfg.modes?.autonomousEnabled),
      autonomousRiskLevel: cfg.modes?.autonomousRiskLevel || "safe",
      allowCommandExecution: Boolean(cfg.modes?.allowCommandExecution),
    },
  };
}
