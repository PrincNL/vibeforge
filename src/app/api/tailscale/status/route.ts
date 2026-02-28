import { NextResponse } from "next/server";
import { getTailscaleDiagnostics } from "@/lib-tailscale";

export async function GET() {
  const status = await getTailscaleDiagnostics();
  return NextResponse.json(status);
}
