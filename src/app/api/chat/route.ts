import OpenAI from "openai";
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib-config";

export async function POST(req: Request) {
  const cfg = loadConfig();

  if (cfg.authMode === "openai-oauth" && !cfg.oauth?.connected) {
    return NextResponse.json({ error: "Connect with OpenAI first." }, { status: 401 });
  }

  const apiKey = req.headers.get("x-openai-key") || cfg.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenAI API key provided. Add it in onboarding/settings or send x-openai-key header." },
      { status: 400 },
    );
  }

  const body = await req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: body.model || "gpt-4o-mini",
    input: messages,
  });

  return NextResponse.json({ text: response.output_text || "" });
}
