import { NextResponse } from "next/server";
import { listThreads } from "@/lib-chat-memory";

export async function GET() {
  return NextResponse.json({ ok: true, threads: listThreads() });
}
