import { NextResponse } from "next/server";
import { loadConfig, saveConfig, type AppConfig } from "@/lib-config";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AppConfig>;
    const current = loadConfig();

    const next: AppConfig = {
      ...current,
      ...body,
      oauth: {
        ...(current.oauth || {}),
        ...(body.oauth || {}),
      },
      updater: {
        ...(current.updater || {}),
        ...(body.updater || {}),
      },
      setupCompleted: true,
    };

    saveConfig(next);

    return NextResponse.json({ ok: true, message: "Setup saved." });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to save setup",
      },
      { status: 500 },
    );
  }
}
