"use client";

import { useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function Home() {
  const { data: session, status } = useSession();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-5-mini");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);

  const latestCodeBlock = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return "// Geen code output nog";
    const match = last.content.match(/```[\s\S]*?\n([\s\S]*?)```/);
    return match?.[1] || "// Geen codeblock gevonden in laatste AI-antwoord";
  }, [messages]);

  async function sendPrompt() {
    if (!prompt.trim() || !apiKey) return;

    const next = [...messages, { role: "user" as const, content: prompt }];
    setMessages(next);
    setPrompt("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-key": apiKey,
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
        { role: "assistant", content: `Fout: ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") return <main className="p-8 text-zinc-300">Laden...</main>;

  if (!session) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white grid place-items-center p-8">
        <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h1 className="text-2xl font-semibold">VibeForge</h1>
          <p className="text-zinc-400 text-sm">Login met OpenAI OAuth om je eigen coding cockpit te gebruiken.</p>
          <button onClick={() => signIn("openai")} className="w-full rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black hover:bg-emerald-400">Inloggen met OpenAI</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 md:grid-cols-12">
        <section className="md:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold">Workspace</h2>
          <p className="mt-2 text-xs text-zinc-400">Ingelogd als {session.user?.name || session.user?.email}</p>
          <button onClick={() => signOut()} className="mt-4 rounded-lg border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Uitloggen</button>
          <div className="mt-4 space-y-2">
            <label className="text-xs text-zinc-400">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg bg-zinc-800 p-2 text-sm">
              <option>gpt-5-mini</option><option>gpt-5</option><option>gpt-4o</option>
            </select>
            <label className="text-xs text-zinc-400">OpenAI API key (BYOK)</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="w-full rounded-lg bg-zinc-800 p-2 text-sm" />
          </div>
        </section>

        <section className="md:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col h-[80vh]">
          <h2 className="font-semibold">Vibe Chat</h2>
          <div className="mt-3 flex-1 overflow-auto space-y-3 pr-1">
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl p-3 text-sm ${m.role === "user" ? "bg-zinc-800" : "bg-zinc-950 border border-zinc-800"}`}>
                <div className="mb-1 text-xs text-zinc-400">{m.role === "user" ? "Jij" : "AI"}</div>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{m.content}</pre>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Vraag om code, refactors, features..." className="h-24 flex-1 rounded-xl bg-zinc-800 p-3 text-sm" />
            <button onClick={sendPrompt} disabled={loading} className="rounded-xl bg-emerald-500 px-4 py-3 font-medium text-black disabled:opacity-50">{loading ? "Denken..." : "Send"}</button>
          </div>
        </section>

        <section className="md:col-span-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-[80vh] overflow-auto">
          <h2 className="font-semibold">Live Code Pane</h2>
          <p className="mt-1 text-xs text-zinc-400">Laatste codeblock uit AI output</p>
          <pre className="mt-3 rounded-xl bg-black p-3 text-xs overflow-auto border border-zinc-800">{latestCodeBlock}</pre>
        </section>
      </div>
    </main>
  );
}
