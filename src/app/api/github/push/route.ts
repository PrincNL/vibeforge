import { NextResponse } from "next/server";
import { pushGeneratedCode } from "@/lib-github";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const content = String(body.content || "");
    const path = String(body.path || "generated/patch.ts");
    const message = body.message ? String(body.message) : undefined;

    if (!content.trim()) {
      return NextResponse.json({ ok: false, message: "No content to push." }, { status: 400 });
    }

    const result = await pushGeneratedCode({ content, path, message });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to push to GitHub",
      },
      { status: 500 },
    );
  }
}
