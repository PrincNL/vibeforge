import crypto from "node:crypto";
import { loadConfig, saveConfig } from "@/lib-config";

const AUTH_BASE = "https://auth.openai.com";
const AUTH_URL = `${AUTH_BASE}/oauth/authorize`;
const TOKEN_URL = `${AUTH_BASE}/oauth/token`;

function base64url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32) {
  return base64url(crypto.randomBytes(bytes));
}

function pkceChallenge(verifier: string) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

export function buildRedirectUri(req: Request) {
  const url = new URL(req.url);
  return `${url.origin}/api/oauth/openai/callback`;
}

async function discoverRegistrationEndpoint() {
  const res = await fetch(`${AUTH_BASE}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.registration_endpoint as string | undefined;
}

async function ensureClientId(redirectUri: string) {
  const cfg = loadConfig();
  if (cfg.oauth?.clientId) return cfg.oauth.clientId;

  const registrationEndpoint = await discoverRegistrationEndpoint();
  if (!registrationEndpoint) {
    throw new Error("Could not discover OAuth registration endpoint.");
  }

  const regRes = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "VibeForge",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });

  if (!regRes.ok) {
    const txt = await regRes.text();
    throw new Error(`OAuth registration failed: ${txt}`);
  }

  const regData = await regRes.json();
  const clientId = regData.client_id as string;
  if (!clientId) throw new Error("OAuth registration did not return client_id.");

  saveConfig({ ...cfg, oauth: { ...(cfg.oauth || {}), clientId } });
  return clientId;
}

export async function createAuthorizationUrl(req: Request) {
  const redirectUri = buildRedirectUri(req);
  const clientId = await ensureClientId(redirectUri);

  const state = randomString(24);
  const verifier = randomString(48);
  const challenge = pkceChallenge(verifier);

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid profile email offline_access");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const cfg = loadConfig();
  saveConfig({
    ...cfg,
    oauth: {
      ...(cfg.oauth || {}),
      pendingState: state,
      pendingCodeVerifier: verifier,
      pendingRedirectUri: redirectUri,
    },
  });

  return authUrl.toString();
}

function parseJwtPayload(token?: string) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return payload;
  } catch {
    return null;
  }
}

export async function handleOAuthCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cfg = loadConfig();
  const oauth = cfg.oauth || {};

  if (!code || !state) throw new Error("Missing code/state");
  if (!oauth.pendingState || oauth.pendingState !== state) throw new Error("Invalid OAuth state");
  if (!oauth.pendingCodeVerifier || !oauth.pendingRedirectUri) throw new Error("Missing PKCE session");
  if (!oauth.clientId) throw new Error("Missing OAuth client_id");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: oauth.pendingRedirectUri,
      client_id: oauth.clientId,
      code_verifier: oauth.pendingCodeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`Token exchange failed: ${txt}`);
  }

  const tokenData = await tokenRes.json();
  const payload = parseJwtPayload(tokenData.id_token);
  const email = payload?.email || "Connected account";

  saveConfig({
    ...cfg,
    oauth: {
      ...(cfg.oauth || {}),
      connected: true,
      email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      pendingState: undefined,
      pendingCodeVerifier: undefined,
      pendingRedirectUri: undefined,
    },
  });
}

export function disconnectOAuth() {
  const cfg = loadConfig();
  saveConfig({
    ...cfg,
    oauth: {
      ...(cfg.oauth || {}),
      connected: false,
      email: "",
      accessToken: "",
      refreshToken: "",
      expiresAt: undefined,
      pendingState: undefined,
      pendingCodeVerifier: undefined,
      pendingRedirectUri: undefined,
    },
  });
}
