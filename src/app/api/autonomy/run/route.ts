import { NextResponse } from "next/server";
import OpenAI from "openai";
import path from "node:path";
import { loadConfig } from "@/lib-config";
import { getAutonomyState, requestStop, runCommands, setWorkspaceRoot } from "@/lib-autonomy";

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
      {
        ok: false,
        message:
          "Blocked: writes outside install directory are not allowed unless user explicitly enables it.",
      },
      { status: 400 },
    );
  }

  setWorkspaceRoot(requestedRoot);

  const apiKey = process.env.OPENAI_API_KEY || cfg.openaiApiKey;
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "No OpenAI API key configured." }, { status: 400 });
  }

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
  let parsed: { summary?: string; tasks?: string[]; commands?: string[] } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { summary: text, tasks: [], commands: [] };
  }

  let executed: Array<{ command: string; output: string; ok: boolean }> = [];

  if (execute && cfg.modes?.allowCommandExecution && Array.isArray(parsed.commands)) {
    executed = await runCommands(parsed.commands.slice(0, 8), requestedRoot);
  }

  return NextResponse.json({
    ok: true,
    summary: parsed.summary || "Plan generated",
    tasks: parsed.tasks || [],
    commands: parsed.commands || [],
    executed,
    state: getAutonomyState(),
  });
}
