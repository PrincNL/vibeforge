import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import OpenAI from "openai";
import { loadConfig } from "@/lib-config";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  const cfg = loadConfig();
  const body = await req.json();
  const goal = String(body.goal || "").trim();
  const execute = Boolean(body.execute);

  if (!cfg.modes?.autonomousEnabled) {
    return NextResponse.json({ ok: false, message: "Autonomous mode is disabled." }, { status: 400 });
  }

  if (!goal) {
    return NextResponse.json({ ok: false, message: "Goal is required." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY || cfg.openaiApiKey;
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "No OpenAI API key configured." }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });
  const result = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "You are an autonomous software operator. Return strict JSON with keys: summary, tasks(string[]), commands(string[]).",
      },
      {
        role: "user",
        content: `Goal: ${goal}\nRisk level: ${cfg.modes?.autonomousRiskLevel}\nProactive: ${cfg.modes?.proactive}`,
      },
    ],
  });

  const text = result.output_text || "{}";

  let parsed: { summary?: string; tasks?: string[]; commands?: string[] } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { summary: text, tasks: [], commands: [] };
  }

  let executed: Array<{ command: string; output: string }> = [];

  if (
    execute &&
    cfg.modes?.autonomousRiskLevel === "high-risk" &&
    cfg.modes?.allowCommandExecution &&
    Array.isArray(parsed.commands)
  ) {
    for (const command of parsed.commands.slice(0, 5)) {
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
      executed.push({ command, output: `${stdout}\n${stderr}`.slice(0, 4000) });
    }
  }

  return NextResponse.json({
    ok: true,
    summary: parsed.summary || "Plan generated",
    tasks: parsed.tasks || [],
    commands: parsed.commands || [],
    executed,
    warning:
      cfg.modes?.autonomousRiskLevel === "high-risk"
        ? "High-risk mode enabled. Commands can change your system."
        : "Safe mode enabled. No commands executed.",
  });
}
