import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, authRuntime } from "@/lib-auth";

export async function POST(req: Request) {
  if (!authRuntime.devBypassLogin) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No OpenAI API key provided. Set OPENAI_API_KEY in .env or send x-openai-key header.",
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
