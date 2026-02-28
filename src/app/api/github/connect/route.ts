import { NextResponse } from "next/server";
import { validateGithubConnection } from "@/lib-github";

export async function POST() {
  try {
    const result = await validateGithubConnection();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to validate GitHub connection",
      },
      { status: 500 },
    );
  }
}
