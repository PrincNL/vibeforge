import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib-openai-oauth";

export async function GET(req: Request) {
  try {
    await handleOAuthCallback(req);
    return NextResponse.redirect(new URL("/?oauth=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/?oauth_error=Connection%20failed%2C%20try%20again", req.url));
  }
}
