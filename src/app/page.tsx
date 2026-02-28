"use client";

import { useEffect, useMemo, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };
type Reasoning = "off" | "low" | "medium" | "high";
type ThreadItem = { id: string; title: string; updatedAt: string; count: number };
type SetupStatus = {
  setupCompleted: boolean;
  authMode: "dev-bypass" | "openai-oauth";
  theme: "midnight" | "ocean" | "sunset" | "forest";
  oauthConnected: boolean;
};
type UpdateStatus = { ok: boolean; current: string; remote: string; hasUpdate: boolean; message?: string };
type AutonomyState = {
  status: "idle" | "running" | "stopped";
  currentCommand: string | null;
  activities: Array<{ ts: string; type: "info" | "command" | "error"; text: string }>;
};
type Diagnostics = {
  ok: boolean;
  blockers: Array<{ id: string; title: string; detail: string; oneClickFix?: boolean }>;
};

const themeBg: Record<string, string> = {
  midnight: "bg-zinc-950 text-zinc-100",
  ocean: "bg-slate-950 text-cyan-100",
  sunset: "bg-neutral-950 text-orange-100",
  forest: "bg-zinc-950 text-lime-100",
};

export default function Home() {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [reasoning, setReasoning] = useState<Reasoning>("low");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [autonomyGoal, setAutonomyGoal] = useState("Autonomously inspect and improve this project");
  const [autonomyProjectDir, setAutonomyProjectDir] = useState("");
  const [allowOutsideStorage, setAllowOutsideStorage] = useState(false);
  const [autonomyState, setAutonomyState] = useState<AutonomyState | null>(null);
  const [autonomyMessage, setAutonomyMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [selfTestMessage, setSelfTestMessage] = useState("");

  const latestCodeBlock = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
    const match = last.match(/```[\s\S]*?\n([\s\S]*?)```/);
    return match?.[1] || "// Waiting for generated code...";
  }, [messages]);

  async function refreshSetup() {
    const res = await fetch("/api/setup/status", { cache: "no-store" });
    setSetup(await res.json());
  }

  async function refreshThreads() {
    const res = await fetch("/api/chats/list", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return;
    setThreads(data.threads || []);
    if (!activeThreadId && data.threads?.[0]?.id) await loadThread(data.threads[0].id);
  }

  async function createNewChat() {
    const res = await fetch("/api/chats/create", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const data = await res.json();
    if (!res.ok) return;
    await refreshThreads();
    await loadThread(data.thread.id);
  }

  async function loadThread(id: string) {
    const res = await fetch(`/api/chats/thread?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return;
    setActiveThreadId(id);
    setMessages((data.thread?.messages || []).map((m: any) => ({ role: m.role, content: m.content })));
  }

  async function persist(role: "user" | "assistant", content: string) {
    if (!activeThreadId || !content) return;
    await fetch("/api/chats/message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: activeThreadId, role, content }) });
    await fetch("/api/memory/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: activeThreadId, role, text: content }) });
  }

  async function checkUpdates() {
    setUpdateBusy(true);
    const res = await fetch("/api/update/status", { cache: "no-store" });
    const data = await res.json();
    setUpdateStatus(data);
    if (!res.ok) setUpdateMessage(data.message || "Failed to check updates");
    setUpdateBusy(false);
  }

  async function applyUpdate() {
    setUpdateBusy(true);
    setUpdateMessage("");
    const res = await fetch("/api/update/apply", { method: "POST" });
    const data = await res.json();
    setUpdateMessage(data.message || (res.ok ? "Updated" : "Update failed"));
    await checkUpdates();
    setUpdateBusy(false);
  }

  async function refreshAutonomyState() {
    const res = await fetch("/api/autonomy/run", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setAutonomyState(data.state || null);
  }

  async function startAutonomy() {
    setAutonomyMessage("Starting...");
    const res = await fetch("/api/autonomy/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: autonomyGoal, execute: true, projectDir: autonomyProjectDir || undefined, allowOutsideStorage }),
    });
    const data = await res.json();
    setAutonomyMessage(data.summary || data.message || "Autonomy response received");
    await refreshAutonomyState();
  }

  async function stopAutonomy() {
    await fetch("/api/autonomy/run", { method: "DELETE" });
    setAutonomyMessage("Stopped.");
    await refreshAutonomyState();
  }

  async function refreshDiagnostics() {
    setDiagBusy(true);
    const res = await fetch("/api/diagnostics", { cache: "no-store" });
    setDiagnostics(await res.json());
    setDiagBusy(false);
  }

  async function runFix(fixId: string) {
    setDiagBusy(true);
    const res = await fetch("/api/diagnostics/fix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixId }) });
    const data = await res.json();
    setSelfTestMessage(data.message || (res.ok ? "Fix done" : "Fix failed"));
    await refreshDiagnostics();
    setDiagBusy(false);
  }

  async function runSelfTest() {
    setSelfTestMessage("Running self-test...");
    const res = await fetch("/api/codex/self-test", { cache: "no-store" });
    const data = await res.json();
    setSelfTestMessage(res.ok ? `Codex OK: ${data.working || "unknown"}` : (data?.candidates?.[0]?.error || "Codex self-test failed"));
  }

  async function sendPrompt() {
    if (!prompt.trim()) return;
    if (!activeThreadId) await createNewChat();
    const userText = prompt;
    const next = [...messages, { role: "user" as const, content: userText }];
    setMessages(next);
    setPrompt("");
    setLoading(true);
    await persist("user", userText);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", ...(apiKey ? { "x-openai-key": apiKey } : {}) },
        body: JSON.stringify({ model: "gpt-5.3-codex", reasoning, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
      await persist("assistant", data.text);
      await refreshThreads();
    } catch (e) {
      const msg = `Error: ${(e as Error).message}`;
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      await persist("assistant", msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSetup();
    refreshThreads();
    checkUpdates();
    refreshAutonomyState();
    refreshDiagnostics();
    const timer = setInterval(() => refreshAutonomyState(), 2000);
    return () => clearInterval(timer);
  }, []);

  const theme = themeBg[setup?.theme || "midnight"];

  return (
    <main className={`min-h-screen ${theme} p-4 md:p-6`}>
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-12 gap-4">
        <aside className="md:col-span-3 glass rounded-3xl p-4 space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-lg">VibeForge</h2><button onClick={createNewChat} className="rounded-lg px-2 py-1 border border-white/20 text-xs">New chat</button></div>
          <div className="glass rounded-2xl p-3 space-y-2 max-h-48 overflow-auto">{threads.map((t) => <button key={t.id} onClick={() => loadThread(t.id)} className={`w-full text-left rounded px-2 py-1 text-xs ${activeThreadId === t.id ? "bg-white/15" : "bg-black/20"}`}>{t.title} ({t.count})</button>)}</div>
          <div className="space-y-2">
            <div className="text-xs text-zinc-400">Model: gpt-5.3-codex</div>
            <div className="grid grid-cols-4 gap-1">{(["off", "low", "medium", "high"] as Reasoning[]).map((r) => <button key={r} onClick={() => setReasoning(r)} className={`rounded px-2 py-1 text-xs border ${reasoning === r ? "bg-emerald-400 text-black" : "border-white/20"}`}>{r}</button>)}</div>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="API key override" className="w-full rounded bg-black/30 border border-white/10 p-2 text-xs" />
          </div>
          <div className="glass rounded-2xl p-3 text-xs space-y-2">
            <div>{updateStatus?.current || "..."} → {updateStatus?.remote || "..."}</div>
            <div className="flex gap-2"><button onClick={checkUpdates} disabled={updateBusy} className="rounded border border-white/20 px-2 py-1">{updateBusy ? "..." : "Check"}</button><button onClick={applyUpdate} disabled={updateBusy} className="rounded bg-emerald-400 text-black px-2 py-1">{updateBusy ? "Updating" : "Update now"}</button></div>
            <button onClick={runSelfTest} className="rounded border border-white/20 px-2 py-1">Codex self-test</button>
            {updateMessage && <div>{updateMessage}</div>}
            {selfTestMessage && <div className="text-zinc-400">{selfTestMessage}</div>}
          </div>
        </aside>

        <section className="md:col-span-5 glass rounded-3xl p-4 h-[84vh] flex flex-col">
          <h2 className="font-semibold text-lg">Codex Chat</h2>
          <div className="mt-3 flex-1 overflow-auto space-y-2">{messages.map((m, i) => <div key={i} className={`rounded-xl p-2 text-xs ${m.role === "user" ? "bg-white/10" : "bg-black/35 border border-white/10"}`}><pre className="whitespace-pre-wrap font-mono">{m.content}</pre></div>)}</div>
          <div className="mt-3 flex gap-2"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="flex-1 h-24 rounded-2xl bg-black/30 border border-white/10 p-3 text-sm" /><button onClick={sendPrompt} disabled={loading} className="rounded-2xl bg-emerald-400 text-black font-semibold px-4 py-3">{loading ? "Working..." : "Run"}</button></div>
        </section>

        <section className="md:col-span-4 glass rounded-3xl p-4 h-[84vh] overflow-auto space-y-3">
          <h3 className="font-semibold">Live Code Pane</h3>
          <pre className="rounded-2xl bg-black/50 border border-white/10 p-3 text-xs overflow-auto min-h-48">{latestCodeBlock}</pre>
          <div className="rounded-2xl bg-black/30 border border-white/10 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between"><span>Autonomy</span><div className="flex gap-2"><button onClick={startAutonomy} className="rounded bg-emerald-400 text-black px-2 py-1">Start</button><button onClick={stopAutonomy} className="rounded bg-red-500 text-black px-2 py-1">Stop</button></div></div>
            <input value={autonomyGoal} onChange={(e) => setAutonomyGoal(e.target.value)} className="w-full rounded bg-black/30 border border-white/10 p-2" />
            <input value={autonomyProjectDir} onChange={(e) => setAutonomyProjectDir(e.target.value)} placeholder="Project dir (optional)" className="w-full rounded bg-black/30 border border-white/10 p-2" />
            <label className="flex items-center gap-2"><input type="checkbox" checked={allowOutsideStorage} onChange={(e) => setAllowOutsideStorage(e.target.checked)} /> Allow outside install dir</label>
            <div>Status: <span className="text-emerald-300">{autonomyState?.status || "idle"}</span></div>
            <div>Current: {autonomyState?.currentCommand || "-"}</div>
            {autonomyMessage && <div className="text-zinc-300">{autonomyMessage}</div>}
            <div className="max-h-28 overflow-auto space-y-1">{(autonomyState?.activities || []).slice(0, 8).map((a, i) => <div key={i}><span className="text-zinc-500">{new Date(a.ts).toLocaleTimeString()} </span><span className={a.type === "error" ? "text-red-300" : a.type === "command" ? "text-cyan-300" : "text-zinc-300"}>{a.text}</span></div>)}</div>
          </div>
          <div className="rounded-2xl bg-black/30 border border-white/10 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between"><span>Diagnostics</span><button onClick={refreshDiagnostics} disabled={diagBusy} className="rounded border border-white/20 px-2 py-1">{diagBusy ? "..." : "Refresh"}</button></div>
            {(diagnostics?.blockers || []).length === 0 ? <div className="text-emerald-300">No blockers detected</div> : diagnostics?.blockers.map((b) => <div key={b.id} className="rounded bg-black/40 p-2"><div className="text-red-300">{b.title}</div><div className="text-zinc-400">{b.detail}</div>{b.oneClickFix && <button onClick={() => runFix(b.id)} className="mt-1 rounded border border-emerald-400/40 px-2 py-1 text-emerald-300">One-click fix</button>}</div>)}
          </div>
        </section>
      </div>
    </main>
  );
}
