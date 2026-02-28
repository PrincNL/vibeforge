import { NextResponse } from "next/server";
import { loadConfig } from "@/lib-config";
import { codexSelfTest } from "@/lib-codex";
import { getUpdateStatus } from "@/lib-updater";
import { getTailscaleDiagnostics } from "@/lib-tailscale";

export type PreflightState = "pass" | "warn" | "fail";

type PreflightCheck = {
  id: string;
  label: string;
  state: PreflightState;
  detail: string;
  remediation?: string;
  fixId?: string;
};

export async function GET() {
  const cfg = loadConfig();

  const [codex, update, tailscale] = await Promise.all([codexSelfTest(), getUpdateStatus(), getTailscaleDiagnostics()]);

  const authReady = Boolean(cfg.openaiApiKey || cfg.oauth?.connected);
  const remoteSafe = cfg.modes?.remoteTailnetOnly !== false && cfg.modes?.requireRemoteToken !== false && !cfg.modes?.allowCommandExecution;

  const checks: PreflightCheck[] = [
    {
      id: "login",
      label: "Login / auth",
      state: authReady ? "pass" : "fail",
      detail: authReady ? "OAuth or API key configured" : "No auth configured (OAuth disconnected and API key missing)",
      remediation: authReady ? undefined : "Connect OpenAI OAuth or provide API key override.",
      fixId: authReady ? undefined : "oauth_connect",
    },
    {
      id: "chat",
      label: "Chat runtime",
      state: codex.ok ? "pass" : "warn",
      detail: codex.ok ? `Codex available (${codex.working})` : "Codex runtime unavailable, fallback may degrade",
      remediation: codex.ok ? undefined : "Install/repair Codex CLI runtime and rerun self-test.",
      fixId: codex.ok ? undefined : "codex_runtime",
    },
    {
      id: "autonomy",
      label: "Autonomy safety",
      state: remoteSafe ? "pass" : "warn",
      detail: remoteSafe ? "Remote-safe defaults enforced" : "Remote-safe defaults are relaxed",
      remediation: remoteSafe ? undefined : "Apply safe defaults (tailnet-only + token + command execution off).",
      fixId: remoteSafe ? undefined : "tailscale_safe_defaults",
    },
    {
      id: "update",
      label: "Updater",
      state: update.ok ? "pass" : "fail",
      detail: update.ok ? `${update.current} → ${update.remote}` : update.message || "Updater status failed",
      remediation: update.ok ? undefined : "Verify git remote and branch are reachable; retry update check.",
      fixId: update.ok ? undefined : "update_check",
    },
    {
      id: "tailscale",
      label: "Tailscale connectivity",
      state: tailscale.ok ? "pass" : "warn",
      detail: tailscale.detail,
      remediation: tailscale.ok ? undefined : "Bring Tailscale online with `sudo tailscale up --ssh` and rerun diagnostics.",
      fixId: tailscale.ok ? undefined : "tailscale_connectivity",
    },
  ];

  const fail = checks.filter((c) => c.state === "fail").length;
  const warn = checks.filter((c) => c.state === "warn").length;

  return NextResponse.json({
    ok: fail === 0,
    score: {
      pass: checks.filter((c) => c.state === "pass").length,
      warn,
      fail,
      total: checks.length,
    },
    checks,
    runtime: {
      authMode: cfg.authMode,
      oauthConnected: Boolean(cfg.oauth?.connected),
      hasApiKey: Boolean(cfg.openaiApiKey || process.env.OPENAI_API_KEY),
      tailscale,
      update,
      codex,
    },
  });
}
