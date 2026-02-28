import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { codexSelfTest } from "@/lib-codex";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  const { fixId } = await req.json();

  try {
    if (fixId === "codex_runtime") {
      await execAsync(`${process.platform === "win32" ? "npx.cmd" : "npx"} -y @openai/codex --help`, { timeout: 30000, shell: (process.platform === "win32" ? "cmd.exe" : undefined) });
      const result = await codexSelfTest();
      return NextResponse.json({ ok: result.ok, message: result.ok ? "Codex runtime validated." : "Codex still unavailable.", codex: result });
    }

    if (fixId === "update_check") {
      await execAsync("git fetch --all --prune", { timeout: 30000 }).catch(() => {});
      return NextResponse.json({ ok: true, message: "Retried git connectivity." });
    }

    return NextResponse.json({ ok: false, message: "Unsupported fix id." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Fix failed" }, { status: 500 });
  }
}
