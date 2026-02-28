import { NextResponse } from "next/server";
import { authRuntime } from "@/lib-auth";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: authRuntime.devBypassLogin ? "dev-bypass" : "oauth",
    oauthConfigured: authRuntime.hasOpenAIOAuthConfig,
  });
}
