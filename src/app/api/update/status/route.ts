import { NextResponse } from "next/server";
import { getUpdateStatus } from "@/lib-updater";

export async function GET() {
  const status = await getUpdateStatus();
  return NextResponse.json(status, { status: status.ok ? 200 : 500 });
}
