import { NextResponse } from "next/server";
import { getThread } from "@/lib-chat-memory";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });
  const thread = getThread(id);
  if (!thread) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, thread });
}
