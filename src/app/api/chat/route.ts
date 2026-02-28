import OpenAI from "openai";
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib-config";
import { runViaCodex } from "@/lib-codex";

export async function POST(req: Request) {
  const cfg = loadConfig();

  if (cfg.authMode === "openai-oauth" && !cfg.oauth?.connected) {
    return NextResponse.json({ error: "Connect with OpenAI first." }, { status: 401 });
  }

  const body = await req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const reasoning = String(body.reasoning || "low");
  const lastUser = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

  const apiKey = req.headers.get("x-openai-key") || cfg.openaiApiKey || process.env.OPENAI_API_KEY;

  if (apiKey) {
    const client = new OpenAI({ apiKey });
    const effort = (reasoning === "off" ? "minimal" : reasoning) as "minimal" | "low" | "medium" | "high";

    const response = await client.responses.create({
      model: "gpt-5.3-codex",
      input: messages,
      reasoning: { effort },
    });

    return NextResponse.json({ text: response.output_text || "", meta: { executor: "openai-api-key" } });
  }

  if (cfg.oauth?.connected) {
    try {
      const result = await runViaCodex(lastUser, reasoning);
      return NextResponse.json({ text: result.text, meta: { executor: result.commandTried } });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `Codex session fallback failed:\n${error.message}`
              : "Codex session fallback failed",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "No OpenAI API key configured and no active Codex account session." },
    { status: 400 },
  );
}
