import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib-auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = req.headers.get("x-openai-key");
  if (!apiKey) {
    return NextResponse.json({ error: "No API key provided" }, { status: 400 });
  }

  const body = await req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: body.model || "gpt-5-mini",
    input: messages,
    reasoning: { effort: "medium" },
  });

  return NextResponse.json({ text: response.output_text || "" });
}
