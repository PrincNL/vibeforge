import { NextResponse } from "next/server";
import { loadConfig } from "@/lib-config";
import { codexSelfTest } from "@/lib-codex";
import { getUpdateStatus } from "@/lib-updater";
import { getTailscaleDiagnostics } from "@/lib-tailscale";

export async function GET() {
  const cfg = loadConfig();
  const codex = await codexSelfTest();
  const update = await getUpdateStatus();
  const tailscale = await getTailscaleDiagnostics();

  const blockers: Array<{ id: string; title: string; detail: string; oneClickFix?: boolean }> = [];

  if (cfg.authMode === "openai-oauth" && !cfg.oauth?.connected) {
    blockers.push({ id: "oauth_connect", title: "OpenAI account not connected", detail: "Connect account to enable chat fallback path.", oneClickFix: false });
  }
  if (!cfg.openaiApiKey && !cfg.oauth?.connected) {
    blockers.push({ id: "auth_missing", title: "No auth path configured", detail: "Set API key or connect OpenAI account.", oneClickFix: false });
  }
  if (!codex.ok && cfg.oauth?.connected) {
    blockers.push({ id: "codex_runtime", title: "Codex CLI runtime unavailable", detail: "Codex fallback cannot execute in current runtime.", oneClickFix: true });
  }
  if (!update.ok) {
    blockers.push({ id: "update_check", title: "Update checks failing", detail: update.message || "Could not contact git remote.", oneClickFix: true });
  }

  if (!tailscale.ok) {
    blockers.push({
      id: "tailscale_connectivity",
      title: "Tailscale connectivity not ready",
      detail: tailscale.detail,
      oneClickFix: true,
    });
  }

  if (cfg.modes?.remoteTailnetOnly === false || cfg.modes?.requireRemoteToken === false || cfg.modes?.allowCommandExecution) {
    blockers.push({
      id: "tailscale_safe_defaults",
      title: "Remote safety profile not hardened",
      detail: "Enable tailnet-only, require token, and disable command execution by default.",
      oneClickFix: true,
    });
  }

  return NextResponse.json({
    ok: blockers.length === 0,
    runtime: {
      platform: process.platform,
      node: process.version,
      cwd: process.cwd(),
      authMode: cfg.authMode,
      oauthConnected: Boolean(cfg.oauth?.connected),
      hasApiKey: Boolean(cfg.openaiApiKey || process.env.OPENAI_API_KEY),
      remoteTailnetOnly: cfg.modes?.remoteTailnetOnly !== false,
      requireRemoteToken: cfg.modes?.requireRemoteToken !== false,
      allowCommandExecution: Boolean(cfg.modes?.allowCommandExecution),
    },
    codex,
    update,
    tailscale,
    blockers,
  });
}
