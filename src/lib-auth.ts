import type { NextAuthOptions } from "next-auth";
import { loadConfig } from "@/lib-config";

export function getRuntimeAuth() {
  const cfg = loadConfig();

  const authModeFromEnv = process.env.DEV_BYPASS_LOGIN === "true" ? "dev-bypass" : undefined;
  const authMode = authModeFromEnv || cfg.authMode || "dev-bypass";

  const oauth = {
    issuer: process.env.OPENAI_OAUTH_ISSUER || cfg.oauth?.issuer || "",
    clientId: process.env.OPENAI_OAUTH_CLIENT_ID || cfg.oauth?.clientId || "",
    clientSecret: process.env.OPENAI_OAUTH_CLIENT_SECRET || cfg.oauth?.clientSecret || "",
    authUrl: process.env.OPENAI_OAUTH_AUTH_URL || cfg.oauth?.authUrl || "",
    tokenUrl: process.env.OPENAI_OAUTH_TOKEN_URL || cfg.oauth?.tokenUrl || "",
    userinfoUrl: process.env.OPENAI_OAUTH_USERINFO_URL || cfg.oauth?.userinfoUrl || "",
  };

  const hasOpenAIOAuthConfig =
    Boolean(oauth.clientId) &&
    Boolean(oauth.clientSecret) &&
    Boolean(oauth.issuer || oauth.authUrl);

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
    authorization: runtime.oauth.authUrl
      ? { url: runtime.oauth.authUrl, params: { scope: "openid profile email" } }
      : undefined,
    token: runtime.oauth.tokenUrl ? { url: runtime.oauth.tokenUrl } : undefined,
    userinfo: runtime.oauth.userinfoUrl ? { url: runtime.oauth.userinfoUrl } : undefined,
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
