"use client";

import { useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type ChatMsg = { role: "user" | "assistant"; content: string };

type ToolCall = { name: string; status: "done" | "running"; detail: string };

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_LOGIN === "true";

export default function Home() {
  const { data: session, status } = useSession();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);

  const latestCodeBlock = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return "// No code output yet";
    const match = last.content.match(/```[\s\S]*?\n([\s\S]*?)```/);
    return match?.[1] || "// No code block found in last assistant response";
  }, [messages]);

  const toolFeed: ToolCall[] = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
    return [
      {
        name: "Planner",
        status: loading ? "running" : "done",
        detail: loading ? "Analyzing request..." : "Prompt parsed",
      },
      {
        name: "Coder",
        status: loading ? "running" : "done",
        detail: loading ? "Generating implementation..." : "Implementation generated",
      },
      {
        name: "Patch",
        status: loading ? "running" : "done",
        detail: lastAssistant.includes("```") ? "Code snippets available" : "No code snippets yet",
      },
    ];
  }, [loading, messages]);

  async function sendPrompt() {
    if (!prompt.trim()) return;
    if (!apiKey && !DEV_BYPASS) return;

    const next = [...messages, { role: "user" as const, content: prompt }];
    setMessages(next);
    setPrompt("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-openai-key": apiKey } : {}),
        },
        body: JSON.stringify({
          model,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading" && !DEV_BYPASS) {
    return <main className="p-8 text-zinc-300">Loading...</main>;
  }

  const isLoggedIn = DEV_BYPASS || !!session;

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white grid place-items-center p-8">
        <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h1 className="text-2xl font-semibold">VibeForge</h1>
          <p className="text-zinc-400 text-sm">
            Sign in with OpenAI OAuth to use your local Codex-style coding cockpit.
          </p>
          <button
            onClick={() => signIn("openai")}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black hover:bg-emerald-400"
          >
            Continue with OpenAI
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 md:grid-cols-12">
        <section className="md:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
          <div>
            <h2 className="font-semibold">Threads</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-lg bg-zinc-800 px-3 py-2">Current Session</div>
              <div className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-400">Feature Planning</div>
              <div className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-400">Bugfix Queue</div>
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wide text-zinc-400">Session</h3>
            <p className="mt-2 text-xs text-zinc-400">
              {DEV_BYPASS
                ? "Running in local dev bypass mode"
                : `Signed in as ${session?.user?.name || session?.user?.email}`}
            </p>
            {!DEV_BYPASS && (
              <button
                onClick={() => signOut()}
                className="mt-3 rounded-lg border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
              >
                Sign out
              </button>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 p-2 text-sm"
            >
              <option>gpt-4o-mini</option>
              <option>gpt-4o</option>
              <option>gpt-5-mini</option>
              <option>gpt-5</option>
            </select>

            <label className="text-xs text-zinc-400">OpenAI API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={DEV_BYPASS ? "Optional if OPENAI_API_KEY is in .env" : "sk-..."}
              className="w-full rounded-lg bg-zinc-800 p-2 text-sm"
            />
          </div>
        </section>

        <section className="md:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col h-[80vh]">
          <h2 className="font-semibold">Chat</h2>
          <div className="mt-3 flex-1 overflow-auto space-y-3 pr-1">
            {messages.length === 0 && (
              <div className="rounded-xl border border-zinc-800 p-3 text-xs text-zinc-400">
                Ask for features, refactors, tests, docs, or full file patches.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl p-3 text-sm ${
                  m.role === "user" ? "bg-zinc-800" : "bg-zinc-950 border border-zinc-800"
                }`}
              >
                <div className="mb-1 text-xs text-zinc-400">{m.role === "user" ? "You" : "Assistant"}</div>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{m.content}</pre>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to build..."
              className="h-24 flex-1 rounded-xl bg-zinc-800 p-3 text-sm"
            />
            <button
              onClick={sendPrompt}
              disabled={loading}
              className="rounded-xl bg-emerald-500 px-4 py-3 font-medium text-black disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Send"}
            </button>
          </div>
        </section>

        <section className="md:col-span-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-[80vh] overflow-auto">
          <h2 className="font-semibold">Tools & Code</h2>
          <div className="mt-3 space-y-2">
            {toolFeed.map((tool) => (
              <div key={tool.name} className="rounded-lg border border-zinc-800 p-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{tool.name}</span>
                  <span className={tool.status === "running" ? "text-amber-300" : "text-emerald-300"}>
                    {tool.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">{tool.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-400">Latest code block from assistant output</p>
          <pre className="mt-2 rounded-xl bg-black p-3 text-xs overflow-auto border border-zinc-800">{latestCodeBlock}</pre>
        </section>
      </div>
    </main>
  );
}
