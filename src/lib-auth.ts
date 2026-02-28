import type { NextAuthOptions } from "next-auth";
import { loadConfig } from "@/lib-config";

export function getRuntimeAuth() {
  const cfg = loadConfig();
  const authModeFromEnv = process.env.DEV_BYPASS_LOGIN === "true" ? "dev-bypass" : undefined;
  const authMode = authModeFromEnv || cfg.authMode || "dev-bypass";

  return {
    authMode,
    devBypassLogin: authMode === "dev-bypass",
    hasOpenAIOAuthConfig: false,
    oauth: {},
    openaiApiKey: process.env.OPENAI_API_KEY || cfg.openaiApiKey || "",
    nextAuthSecret: process.env.NEXTAUTH_SECRET || "local-dev-secret-change-me",
  };
}

export function getAuthOptions(): NextAuthOptions {
  return {
    providers: [],
    session: { strategy: "jwt" },
    secret: process.env.NEXTAUTH_SECRET || "local-dev-secret-change-me",
  };
}
