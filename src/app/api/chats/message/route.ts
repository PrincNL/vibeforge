import { NextResponse } from "next/server";
import { appendMessage } from "@/lib-chat-memory";

export async function POST(req: Request) {
  const body = await req.json();
  const id = String(body.id || "");
  const role = body.role === "assistant" ? "assistant" : "user";
  const content = String(body.content || "");
  if (!id || !content) return NextResponse.json({ ok: false, message: "Missing id/content" }, { status: 400 });
  const thread = appendMessage(id, role, content);
  if (!thread) return NextResponse.json({ ok: false, message: "Thread not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
