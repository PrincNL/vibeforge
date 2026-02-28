import { NextResponse } from "next/server";
import { startDeviceAuth } from "@/lib-device-auth";

export async function POST() {
  try {
    const data = startDeviceAuth();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to start device auth" },
      { status: 500 },
    );
  }
}
