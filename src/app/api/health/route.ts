import { NextResponse } from "next/server";
import { getRuntimeAuth } from "@/lib-auth";
import { getSafeConfig } from "@/lib-config";

export async function GET() {
  const runtime = getRuntimeAuth();
  const config = getSafeConfig();

  return NextResponse.json({
    ok: true,
    mode: runtime.devBypassLogin ? "dev-bypass" : "oauth",
    oauthConfigured: runtime.hasOpenAIOAuthConfig,
    setupCompleted: config.setupCompleted,
  });
}
