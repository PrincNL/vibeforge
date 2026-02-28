import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions, getRuntimeAuth } from "@/lib-auth";

export async function POST(req: Request) {
  const runtime = getRuntimeAuth();

  if (!runtime.devBypassLogin) {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const apiKey = req.headers.get("x-openai-key") || runtime.openaiApiKey;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No OpenAI API key provided. Add it in onboarding or send x-openai-key header.",
      },
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
