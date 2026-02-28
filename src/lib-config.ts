import fs from "node:fs";
import path from "node:path";

export type AppConfig = {
  setupCompleted: boolean;
  authMode: "dev-bypass" | "openai-oauth";
  openaiApiKey?: string;
  oauth?: {
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    authUrl?: string;
    tokenUrl?: string;
    userinfoUrl?: string;
  };
  updater?: {
    repoPath?: string;
    branch?: string;
    restartCommand?: string;
    token?: string;
  };
};

const CONFIG_DIR = path.join(process.cwd(), "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "onboarding.json");

const defaultConfig: AppConfig = {
  setupCompleted: false,
  authMode: "dev-bypass",
  openaiApiKey: "",
  oauth: {},
  updater: {
    branch: "main",
  },
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
    hasOpenAIApiKey: Boolean(cfg.openaiApiKey),
    oauthConfigured:
      Boolean(cfg.oauth?.clientId) &&
      Boolean(cfg.oauth?.clientSecret) &&
      Boolean(cfg.oauth?.issuer || cfg.oauth?.authUrl),
    updater: {
      branch: cfg.updater?.branch || "main",
      repoPath: cfg.updater?.repoPath || process.cwd(),
      hasToken: Boolean(cfg.updater?.token),
      hasRestartCommand: Boolean(cfg.updater?.restartCommand),
    },
  };
}
