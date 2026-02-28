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

export async function GET() {
  return NextResponse.json({ ok: true, state: getAutonomyState() });
}

export async function DELETE() {
  requestStop();
  return NextResponse.json({ ok: true, message: "Autonomy stopped" });
}

export async function POST(req: Request) {
  const cfg = loadConfig();
  const body = await req.json();

  const goal = String(body.goal || "").trim();
  const execute = Boolean(body.execute);
  const selectedDir = String(body.projectDir || "").trim();
  const allowOutsideStorage = Boolean(body.allowOutsideStorage);

  if (!goal) {
    return NextResponse.json({ ok: false, message: "Goal is required." }, { status: 400 });
  }

  const installRoot = process.cwd();
  const requestedRoot = path.resolve(selectedDir || installRoot);
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
