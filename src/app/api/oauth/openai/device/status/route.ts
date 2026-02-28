import { NextResponse } from "next/server";
import { getDeviceAuthStatus } from "@/lib-device-auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });
  return NextResponse.json(getDeviceAuthStatus(id));
}
