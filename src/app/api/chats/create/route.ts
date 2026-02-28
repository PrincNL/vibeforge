import { NextResponse } from "next/server";
import { createThread } from "@/lib-chat-memory";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const thread = createThread(body.title);
  return NextResponse.json({ ok: true, thread });
}
