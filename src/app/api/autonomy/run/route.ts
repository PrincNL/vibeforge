import { NextResponse } from "next/server";
import OpenAI from "openai";
import path from "node:path";
import { loadConfig } from "@/lib-config";
import { getAutonomyState, requestStop, runCommands, setWorkspaceRoot } from "@/lib-autonomy";

function heuristicCommands(goal: string) {
  const lower = goal.toLowerCase();
  const commands = ["npm run build"];
  if (lower.includes("test")) commands.unshift("npm test");
  if (lower.includes("lint")) commands.unshift("npm run lint");
  return commands;
}

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || "";
}

function isTailnetIp(ip: string) {
  return /^100\./.test(ip) || /^fd7a:115c:a1e0:/i.test(ip);
}

function isLocalIp(ip: string) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "";
}

function authorizedRemote(req: Request) {
  const cfg = loadConfig();
  const tokenRequired = cfg.modes?.requireRemoteToken !== false;
  const configured = process.env.VIBEFORGE_REMOTE_TOKEN || "";
  if (!tokenRequired) return true;
  if (!configured) return false;
  const incoming = req.headers.get("x-vf-remote-token") || "";
  return incoming.length > 0 && incoming === configured;
}

function normalizeProjectDir(rawDir: string, installRoot: string) {
  const input = (rawDir || "").trim();
  if (!input) return { ok: true as const, resolved: installRoot };

  const hasWindowsDrive = /^[A-Za-z]:[\\/]/.test(input);
  if (hasWindowsDrive && process.platform !== "win32") {
    return {
      ok: false as const,
      message: `Windows-style path not supported on ${process.platform}: ${input}. Use a path on this host.`,
    };
  }

  const normalizedInput = process.platform === "win32" ? input.replace(/\//g, "\\") : input.replace(/\\/g, "/");
  const resolved = path.resolve(normalizedInput);
  return { ok: true as const, resolved };
}

function isRemoteBlocked(req: Request, cfg: ReturnType<typeof loadConfig>, action: string) {
  const ip = getClientIp(req);

  if (cfg.modes?.remoteTailnetOnly !== false && !isLocalIp(ip) && !isTailnetIp(ip)) {
    return NextResponse.json({ ok: false, message: `${action} blocked: non-tailnet remote request.` }, { status: 403 });
  }

  if (!isLocalIp(ip) && !authorizedRemote(req)) {
    return NextResponse.json({ ok: false, message: `${action} blocked: remote token invalid or missing.` }, { status: 401 });
  }

  return null;
}

export async function GET(req: Request) {
  const cfg = loadConfig();
  const ip = getClientIp(req);

  if (cfg.modes?.remoteTailnetOnly !== false && !isLocalIp(ip) && !isTailnetIp(ip)) {
    return NextResponse.json({ ok: false, message: "Autonomy status blocked: non-tailnet remote request." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, state: getAutonomyState() });
}

export async function DELETE(req: Request) {
  const cfg = loadConfig();
  const blocked = isRemoteBlocked(req, cfg, "Autonomy stop");
  if (blocked) return blocked;

  requestStop();
  return NextResponse.json({ ok: true, message: "Autonomy stopped" });
}

export async function POST(req: Request) {
  const cfg = loadConfig();
  const blocked = isRemoteBlocked(req, cfg, "Autonomy");
  if (blocked) return blocked;

  const body = await req.json();

  const goal = String(body.goal || "").trim();
  const execute = Boolean(body.execute);
  const selectedDir = String(body.projectDir || "").trim();
  const allowOutsideStorage = Boolean(body.allowOutsideStorage);

  if (!goal) {
    return NextResponse.json({ ok: false, message: "Goal is required." }, { status: 400 });
  }

  const installRoot = process.cwd();
  const normalized = normalizeProjectDir(selectedDir, installRoot);
  if (!normalized.ok) {
    return NextResponse.json({ ok: false, message: normalized.message }, { status: 400 });
  }

  const requestedRoot = normalized.resolved;
  const insideInstall = requestedRoot === installRoot || requestedRoot.startsWith(installRoot + path.sep);

  if (!insideInstall && !allowOutsideStorage) {
    return NextResponse.json(
      { ok: false, message: "Blocked: writes outside install directory are not allowed unless explicitly enabled." },
      { status: 400 },
    );
  }

  setWorkspaceRoot(requestedRoot);

  const apiKey = process.env.OPENAI_API_KEY || cfg.openaiApiKey;
  let plan: { summary?: string; tasks?: string[]; commands?: string[] } = {};

  if (apiKey) {
    try {
      const client = new OpenAI({ apiKey });
      const result = await client.responses.create({
        model: "gpt-5.3-codex",
        input: [
          {
            role: "system",
            content:
              "You are an autonomous software operator. Return strict JSON: {summary:string,tasks:string[],commands:string[]}. Keep commands safe and project-local.",
          },
          {
            role: "user",
            content: `Goal: ${goal}\nProjectDir: ${requestedRoot}\nRiskLevel: ${cfg.modes?.autonomousRiskLevel}`,
          },
        ],
        reasoning: { effort: "medium" },
      });

      const text = result.output_text || "{}";
      try {
        plan = JSON.parse(text);
      } catch {
        plan = { summary: text, tasks: [], commands: [] };
      }
    } catch {
      plan = {
        summary: "Planner unavailable; switched to local heuristic fallback.",
        tasks: ["Run safe baseline checks"],
        commands: heuristicCommands(goal),
      };
    }
  } else {
    plan = {
      summary: "No API key configured; using local heuristic fallback.",
      tasks: ["Run safe baseline checks"],
      commands: heuristicCommands(goal),
    };
  }

  let executed: Array<{ command: string; output: string; ok: boolean }> = [];

  if (execute && cfg.modes?.allowCommandExecution && Array.isArray(plan.commands)) {
    executed = await runCommands(plan.commands.slice(0, 8), requestedRoot);
  }

  return NextResponse.json({
    ok: true,
    summary: plan.summary || "Plan generated",
    tasks: plan.tasks || [],
    commands: plan.commands || [],
    executed,
    state: getAutonomyState(),
  });
}
