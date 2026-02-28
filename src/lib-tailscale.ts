import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type TailscaleDiagnostics = {
  ok: boolean;
  installed: boolean;
  running: boolean;
  backendState: string;
  tailnetIp: string;
  tailnetName: string;
  selfDnsName: string;
  relay: "direct" | "derp" | "mixed" | "unknown";
  peersOnline: number;
  detail: string;
  suggestions: Array<{ id: string; title: string; detail: string; oneClickFix?: boolean }>;
};

function classifyRelay(self: any): TailscaleDiagnostics["relay"] {
  const rx = self?.Relay;
  if (typeof rx === "string" && rx.toLowerCase().includes("derp")) return "derp";

  const cur = self?.CurAddr || "";
  if (typeof cur === "string" && cur.length > 0) return "direct";

  return "unknown";
}

export async function getTailscaleDiagnostics(): Promise<TailscaleDiagnostics> {
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"], { timeout: 5000 });
    const raw = JSON.parse(stdout || "{}");

    const self = raw?.Self || {};
    const tailscaleIp = Array.isArray(self?.TailscaleIPs) ? String(self.TailscaleIPs[0] || "") : "";
    const peers = raw?.Peer ? Object.values(raw.Peer) : [];
    const peersOnline = peers.filter((p: any) => Boolean(p?.Online)).length;
    const backendState = String(raw?.BackendState || "unknown");
    const running = backendState.toLowerCase() === "running";
    const relay = classifyRelay(self);

    const suggestions: TailscaleDiagnostics["suggestions"] = [];

    if (!running) {
      suggestions.push({
        id: "tailscale_up",
        title: "Bring interface online",
        detail: "Run `sudo tailscale up` on this machine.",
        oneClickFix: false,
      });
    }

    if (!tailscaleIp) {
      suggestions.push({
        id: "tailscale_no_ip",
        title: "No tailnet IP detected",
        detail: "Authenticate this device in Tailscale admin and re-run checks.",
        oneClickFix: false,
      });
    }

    if (relay === "derp") {
      suggestions.push({
        id: "tailscale_derp",
        title: "Connection uses DERP relay",
        detail: "Remote works, but direct path is faster. Check NAT/firewall for UDP 41641 and port mapping.",
        oneClickFix: false,
      });
    }

    return {
      ok: running && Boolean(tailscaleIp),
      installed: true,
      running,
      backendState,
      tailnetIp: tailscaleIp,
      tailnetName: String(raw?.CurrentTailnet?.Name || ""),
      selfDnsName: String(self?.DNSName || ""),
      relay,
      peersOnline,
      detail: running ? "Tailscale is active" : "Tailscale not active",
      suggestions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tailscale command unavailable";
    const missing = message.includes("ENOENT") || message.toLowerCase().includes("not found");

    return {
      ok: false,
      installed: !missing,
      running: false,
      backendState: "unavailable",
      tailnetIp: "",
      tailnetName: "",
      selfDnsName: "",
      relay: "unknown",
      peersOnline: 0,
      detail: missing ? "Tailscale CLI not installed" : message,
      suggestions: [
        {
          id: "tailscale_install",
          title: "Install Tailscale",
          detail: "Install from https://tailscale.com/download and run `sudo tailscale up`.",
          oneClickFix: false,
        },
      ],
    };
  }
}
