"use client";

import { useEffect, useMemo, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };
type Reasoning = "off" | "low" | "medium" | "high";
type ThreadItem = { id: string; title: string; updatedAt: string; count: number };

type SetupStatus = {
  setupCompleted: boolean;
  authMode: "dev-bypass" | "openai-oauth";
  theme: "midnight" | "ocean" | "sunset" | "forest";
  hasOpenAIApiKey: boolean;
  oauthConnected: boolean;
  oauthEmail: string;
};

type UpdateStatus = { ok: boolean; current: string; remote: string; hasUpdate: boolean };

const themeBg: Record<string, string> = {
  midnight: "bg-zinc-950 text-zinc-100",
  ocean: "bg-slate-950 text-cyan-100",
  sunset: "bg-neutral-950 text-orange-100",
  forest: "bg-zinc-950 text-lime-100",
};

export default function Home() {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);

  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [reasoning, setReasoning] = useState<Reasoning>("low");

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");

  const [deviceSessionId, setDeviceSessionId] = useState("");
  const [deviceUrl, setDeviceUrl] = useState("https://auth.openai.com/codex/device");
  const [deviceCode, setDeviceCode] = useState("");
  const [deviceMessage, setDeviceMessage] = useState("");
  const [autonomyGoal, setAutonomyGoal] = useState("");
  const [autonomyMessage, setAutonomyMessage] = useState("");
  const [autonomousOn, setAutonomousOn] = useState(false);
  const [autonomyProjectDir, setAutonomyProjectDir] = useState("");
  const [allowOutsideStorage, setAllowOutsideStorage] = useState(false);

  const latestCodeBlock = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
    const match = last.match(/```[\s\S]*?\n([\s\S]*?)```/);
    return match?.[1] || "// Waiting for generated code...";
  }, [messages]);

  async function refreshSetup(showLoader = false) {
    if (showLoader) setSetupLoading(true);
    try {
      const res = await fetch("/api/setup/status", { cache: "no-store" });
      const data = await res.json();
      setSetup(data);
    } finally {
      if (showLoader) setSetupLoading(false);
    }
  }

  async function refreshThreads() {
    const res = await fetch("/api/chats/list", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return;
    const list = data.threads || [];
    setThreads(list);

    if (!activeThreadId) {
      if (list.length) {
        await loadThread(list[0].id);
      } else {
        await createNewChat();
      }
    }
  }

  async function createNewChat() {
    const res = await fetch("/api/chats/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) return;
    await refreshThreads();
    await loadThread(data.thread.id);
  }

  async function loadThread(id: string) {
    const res = await fetch("/api/chats/thread?id=" + encodeURIComponent(id), { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return;
    setActiveThreadId(id);
    const msgs = (data.thread?.messages || []).map((m: any) => ({ role: m.role, content: m.content }));
    setMessages(msgs);
  }

  async function persist(role: "user" | "assistant", content: string) {
    if (!activeThreadId || !content) return;
    await fetch("/api/chats/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: activeThreadId, role, content }),
    });
    await fetch("/api/memory/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: activeThreadId, role, text: content }),
    });
  }

  async function checkUpdates() {
    const res = await fetch("/api/update/status", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setUpdateMessage(data.message || "Failed to check updates");
      return;
    }
    setUpdateStatus(data);
  }

  async function applyUpdate() {
    setUpdateMessage("");
    const res = await fetch("/api/update/apply", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setUpdateMessage(data.message || "Update failed");
      return;
    }
    setUpdateMessage(data.message || "Updated");
    await checkUpdates();
  }

  async function stopAutonomy() {
    await fetch("/api/autonomy/run", { method: "DELETE" });
    setAutonomousOn(false);
    setAutonomyMessage("Emergency stop activated.");
  }

  async function startAutonomyRun() {
    const res = await fetch("/api/autonomy/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal: autonomyGoal || "Autonomously inspect and improve this project",
        execute: true,
        projectDir: autonomyProjectDir || undefined,
        allowOutsideStorage,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAutonomyMessage(data.message || "Autonomy failed to start");
      return;
    }
    setAutonomousOn(true);
    setAutonomyMessage(data.summary || "Autonomy started");
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
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-openai-key": apiKey } : {}),
        },
        body: JSON.stringify({ model: "gpt-5.3-codex", reasoning, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
      await persist("assistant", data.text);
      await refreshThreads();
    } catch (error) {
      const msg = `Error: ${(error as Error).message}`;
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      await persist("assistant", msg);
    } finally {
      setLoading(false);
    }
  }

  async function startDeviceConnect() {
    setDeviceMessage("");
    const res = await fetch("/api/oauth/openai/device/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setDeviceMessage(data.message || "Connection failed, try again");
      return;
    }

    setDeviceSessionId(data.id);
    setDeviceUrl(data.url || "https://auth.openai.com/codex/device");
    setDeviceCode(data.code || "");
    setDeviceMessage("Open OpenAI in browser and enter the code.");
    window.open(data.url || "https://auth.openai.com/codex/device", "_blank", "noopener,noreferrer");
    setTimeout(() => checkDeviceConnect(data.id), 1200);
  }

  async function checkDeviceConnect(sessionId?: string) {
    const id = sessionId || deviceSessionId;
    if (!id) return;
    const res = await fetch("/api/oauth/openai/device/status?id=" + encodeURIComponent(id), { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) {
      setDeviceMessage(data.message || "Connection failed, try again");
      return;
    }
    if (data.code) setDeviceCode(data.code);
    if (data.status === "success") {
      setDeviceMessage("Connected successfully.");
      setDeviceSessionId("");
      await refreshSetup(false);
      return;
    }
    if (data.status === "failed" || data.status === "timeout") {
      setDeviceMessage(data.error || "Connection failed, try again");
      setDeviceSessionId("");
      return;
    }
    setDeviceMessage("Waiting for confirmation...");
  }

  useEffect(() => {
    refreshSetup(true);
    refreshThreads();
  }, []);

  useEffect(() => {
    if (setup?.setupCompleted) checkUpdates();
  }, [setup?.setupCompleted]);

  useEffect(() => {
    if (!deviceSessionId) return;
    const timer = setInterval(() => checkDeviceConnect(deviceSessionId), 3000);
    return () => clearInterval(timer);
  }, [deviceSessionId]);

  useEffect(() => {
    const api = (window as any).vibeforgeDesktop;
    if (!api?.onEmergencyStop) return;
    const unsub = api.onEmergencyStop(() => {
      setAutonomousOn(false);
      setAutonomyMessage("Emergency stop (Ctrl+Alt+Shift+G) triggered.");
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  if (setupLoading) return <main className="min-h-screen grid place-items-center text-zinc-300">Loading workspace…</main>;

  const currentTheme = themeBg[setup?.theme || "midnight"];
  const requiresOAuth = setup?.authMode === "openai-oauth";

  if (requiresOAuth && !setup?.oauthConnected) {
    return (
      <main className={`min-h-screen ${currentTheme} grid place-items-center p-6`}>
        <div className="glass soft-hover w-full max-w-lg rounded-3xl p-6 space-y-4 animate-float-slow">
          <h1 className="text-2xl font-semibold">Connect with OpenAI</h1>
          <p className="text-sm text-zinc-400">One-time login. Your connection will be remembered.</p>
          <button onClick={startDeviceConnect} className="w-full rounded-xl bg-emerald-400 text-black font-semibold px-4 py-3 soft-hover">Connect with OpenAI</button>
          <div className="glass rounded-2xl p-4 text-sm space-y-2">
            <div>1) Open: <a className="text-emerald-300 underline" href={deviceUrl} target="_blank" rel="noreferrer">{deviceUrl}</a></div>
            <div>2) Enter code: <code className="text-emerald-300">{deviceCode || "(waiting for code...)"}</code></div>
            <button onClick={() => checkDeviceConnect()} className="rounded-lg border border-white/20 px-3 py-1 text-xs soft-hover">Check status</button>
            {deviceMessage && <div className="text-zinc-300 text-xs">{deviceMessage}</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen ${currentTheme} p-4 md:p-6`}>
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-12 gap-4">
        <aside className="md:col-span-3 glass rounded-3xl p-4 space-y-4 animate-float">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">VibeForge</h2>
            <button onClick={createNewChat} className="rounded-lg px-2 py-1 border border-white/20 text-xs soft-hover">New chat</button>
          </div>

          <div className="glass rounded-2xl p-3 space-y-2">
            <div className="text-xs text-zinc-400">Chats</div>
            <div className="max-h-40 overflow-auto space-y-1">
              {threads.map((t) => (
                <button key={t.id} onClick={() => loadThread(t.id)} className={`w-full text-left rounded-lg px-2 py-2 text-xs soft-hover ${activeThreadId === t.id ? "bg-white/15" : "bg-black/20"}`}>
                  <div className="truncate">{t.title}</div>
                  <div className="text-[10px] text-zinc-500">{t.count} msgs</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Model</label>
            <div className="rounded-xl bg-black/30 px-3 py-2 text-sm">gpt-5.3-codex</div>
            <label className="text-xs text-zinc-400">Reasoning</label>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {(["off", "low", "medium", "high"] as Reasoning[]).map((r) => (
                <button key={r} onClick={() => setReasoning(r)} className={`rounded-lg px-2 py-2 soft-hover border ${reasoning === r ? "bg-emerald-400 text-black border-emerald-300" : "border-white/15"}`}>{r}</button>
              ))}
            </div>
            <label className="text-xs text-zinc-400">API key override (optional)</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" className="w-full rounded-xl bg-black/30 border border-white/10 p-2 text-sm" />
          </div>

          <div className="glass rounded-2xl p-3 text-xs space-y-2">
            <div className="flex justify-between"><span>Updates</span><span className="text-zinc-400">{updateStatus?.hasUpdate ? "available" : "up to date"}</span></div>
            <div className="text-zinc-400">{updateStatus?.current || "..."} → {updateStatus?.remote || "..."}</div>
            <div className="flex gap-2">
              <button onClick={checkUpdates} className="rounded-lg border border-white/20 px-2 py-1 soft-hover">Check</button>
              <button onClick={applyUpdate} className="rounded-lg bg-emerald-400 text-black px-2 py-1 soft-hover">Update now</button>
            </div>
            {updateMessage && <div>{updateMessage}</div>}
          </div>
        </aside>

        <section className="md:col-span-5 glass rounded-3xl p-4 h-[84vh] flex flex-col">
          <h2 className="font-semibold text-lg">Codex Chat</h2>
          <div className="mt-3 flex-1 overflow-auto space-y-3 pr-1">
            {messages.length === 0 && <div className="rounded-xl border border-white/10 p-3 text-xs text-zinc-400">Start a new chat and give a coding goal.</div>}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-2xl p-3 ${m.role === "user" ? "bg-white/8" : "bg-black/35 border border-white/10"}`}>
                <div className="text-[11px] text-zinc-400 mb-1">{m.role === "user" ? "You" : "Codex"}</div>
                <pre className="whitespace-pre-wrap text-xs font-mono">{m.content}</pre>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe what to build..." className="flex-1 h-24 rounded-2xl bg-black/30 border border-white/10 p-3 text-sm" />
            <button onClick={sendPrompt} disabled={loading} className="rounded-2xl bg-emerald-400 text-black font-semibold px-4 py-3 soft-hover">{loading ? "Working…" : "Run"}</button>
          </div>
        </section>

        <section className="md:col-span-4 glass rounded-3xl p-4 h-[84vh] overflow-auto">
          <h3 className="font-semibold">Live Code Pane</h3>
          <pre className="mt-2 rounded-2xl bg-black/50 border border-white/10 p-3 text-xs overflow-auto min-h-48">{latestCodeBlock}</pre>
                  <div className="glass rounded-2xl p-3 mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Autonomous Mode</span>
              <button onClick={() => (autonomousOn ? stopAutonomy() : startAutonomyRun())} className={`rounded-lg px-3 py-1 text-xs soft-hover ${autonomousOn ? "bg-red-500 text-black" : "bg-emerald-400 text-black"}`}>
                {autonomousOn ? "Stop" : "Start"}
              </button>
            </div>
            <div className="text-[11px] text-zinc-400">Emergency stop hotkey: Ctrl + Alt + Shift + G</div>
            <input value={autonomyProjectDir} onChange={(e)=>setAutonomyProjectDir(e.target.value)} placeholder="Project directory (default: install dir)" className="w-full rounded-xl bg-black/30 border border-white/10 p-2 text-xs"/>
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={allowOutsideStorage} onChange={(e)=>setAllowOutsideStorage(e.target.checked)} /> Allow storage outside install dir (explicit)</label>
            {autonomyMessage && <pre className="text-xs whitespace-pre-wrap text-zinc-300">{autonomyMessage}</pre>}
          </div>
        </section>
      </div>
    </main>
  );
}
