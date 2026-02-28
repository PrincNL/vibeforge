import { NextResponse } from "next/server";
import { logMemoryEntry } from "@/lib-chat-memory";

export async function POST(req: Request) {
  const body = await req.json();
  const threadId = String(body.threadId || "general");
  const role = body.role === "assistant" ? "assistant" : "user";
  const text = String(body.text || "");
  if (!text) return NextResponse.json({ ok: false, message: "Missing text" }, { status: 400 });
  logMemoryEntry({ threadId, role, text });
  return NextResponse.json({ ok: true });
}
