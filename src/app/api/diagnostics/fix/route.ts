import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { codexSelfTest } from "@/lib-codex";
import { loadConfig, saveConfig } from "@/lib-config";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  const { fixId } = await req.json();

  try {
    if (fixId === "codex_runtime") {
      await execAsync(`${process.platform === "win32" ? "npx.cmd" : "npx"} -y @openai/codex --help`, { timeout: 30000, shell: process.platform === "win32" ? "cmd.exe" : undefined });
      const result = await codexSelfTest();
      return NextResponse.json({ ok: result.ok, message: result.ok ? "Codex runtime validated." : "Codex still unavailable.", codex: result });
    }

    if (fixId === "update_check") {
      await execAsync("git fetch --all --prune", { timeout: 30000 }).catch(() => {});
      return NextResponse.json({ ok: true, message: "Retried git connectivity." });
    }

    if (fixId === "tailscale_safe_defaults") {
      const cfg = loadConfig();
      saveConfig({
        ...cfg,
        modes: {
          ...(cfg.modes || {}),
          autonomousEnabled: true,
          autonomousRiskLevel: "safe",
          allowCommandExecution: false,
          remoteTailnetOnly: true,
          requireRemoteToken: true,
        },
      });
      return NextResponse.json({ ok: true, message: "Applied safe remote defaults (tailnet-only + token + no command execution)." });
    }

    if (fixId === "tailscale_connectivity") {
      return NextResponse.json({
        ok: true,
        message:
          "Guidance: install+authenticate tailscale, run `sudo tailscale up --ssh`, then rerun checks. If relay stays DERP, verify NAT/firewall for UDP 41641.",
      });
    }

    if (fixId === "tailscale_show_start_commands") {
      return NextResponse.json({
        ok: true,
        message:
          "Run on host: sudo tailscale up --ssh. Then access VibeForge through tailnet IP/hostname and set VIBEFORGE_REMOTE_TOKEN in env.",
      });
    }

    return NextResponse.json({ ok: false, message: "Unsupported fix id." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Fix failed" }, { status: 500 });
  }
}
