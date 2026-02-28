import { NextResponse } from "next/server";
import { createAuthorizationUrl } from "@/lib-openai-oauth";

export async function GET(req: Request) {
  try {
    const url = await createAuthorizationUrl(req);
    return NextResponse.redirect(url);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "OAuth start failed";
    return NextResponse.redirect(new URL(`/?oauth_error=${encodeURIComponent(msg)}`, req.url));
  }
}
