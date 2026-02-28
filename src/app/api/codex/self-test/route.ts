import { NextResponse } from "next/server";
import { codexSelfTest } from "@/lib-codex";

export async function GET() {
  const result = await codexSelfTest();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
