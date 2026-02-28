import { NextResponse } from "next/server";
import { getSafeConfig } from "@/lib-config";

export async function GET() {
  return NextResponse.json(getSafeConfig());
}
