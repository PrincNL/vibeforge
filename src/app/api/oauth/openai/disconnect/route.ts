import { NextResponse } from "next/server";
import { disconnectOAuth } from "@/lib-openai-oauth";

export async function POST() {
  disconnectOAuth();
  return NextResponse.json({ ok: true });
}
