import type { NextAuthOptions } from "next-auth";
import { loadConfig } from "@/lib-config";

export function getRuntimeAuth() {
  const cfg = loadConfig();

  const authModeFromEnv = process.env.DEV_BYPASS_LOGIN === "true" ? "dev-bypass" : undefined;
  const authMode = authModeFromEnv || cfg.authMode || "dev-bypass";

  const oauth = {
    issuer:
      process.env.OPENAI_OAUTH_ISSUER ||
      cfg.oauth?.issuer ||
      "https://auth.openai.com",
    clientId: process.env.OPENAI_OAUTH_CLIENT_ID || cfg.oauth?.clientId || "",
    clientSecret: process.env.OPENAI_OAUTH_CLIENT_SECRET || cfg.oauth?.clientSecret || "",
  };

  const hasOpenAIOAuthConfig = Boolean(oauth.clientId) && Boolean(oauth.clientSecret);

  return {
    authMode,
    devBypassLogin: authMode === "dev-bypass",
    hasOpenAIOAuthConfig,
    oauth,
    openaiApiKey: process.env.OPENAI_API_KEY || cfg.openaiApiKey || "",
    nextAuthSecret: process.env.NEXTAUTH_SECRET || "local-dev-secret-change-me",
  };
}

export function getAuthOptions(): NextAuthOptions {
  const runtime = getRuntimeAuth();

  const openAIProvider = {
    id: "openai",
    name: "OpenAI",
    type: "oauth",
    issuer: runtime.oauth.issuer || undefined,
    clientId: runtime.oauth.clientId,
    clientSecret: runtime.oauth.clientSecret,
    profile(profile: any) {
      return {
        id: profile.sub || profile.id || "openai-user",
        name: profile.name || profile.email || "OpenAI User",
        email: profile.email,
        image: profile.picture,
      };
    },
  };

  return {
    providers: runtime.hasOpenAIOAuthConfig ? ([openAIProvider] as any) : [],
    session: { strategy: "jwt" },
    secret: runtime.nextAuthSecret,
  };
}
