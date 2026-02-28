import { NextResponse } from "next/server";
import { applyUpdate } from "@/lib-updater";

export async function POST(req: Request) {
  const requiredToken = process.env.APP_UPDATE_TOKEN;
  if (requiredToken) {
    const incomingToken = req.headers.get("x-update-token");
    if (incomingToken !== requiredToken) {
      return NextResponse.json({ ok: false, message: "Invalid update token" }, { status: 401 });
    }
  }

  try {
    const result = await applyUpdate();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Update failed",
      },
      { status: 500 },
    );
  }
}
