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
  modes?: {
    remoteTailnetOnly?: boolean;
    requireRemoteToken?: boolean;
    allowCommandExecution?: boolean;
  };
};

type UpdateStatus = { ok: boolean; current: string; remote: string; hasUpdate: boolean; message?: string };
type AutonomyState = {
  status: "idle" | "running" | "stopped";
  currentCommand: string | null;
  activities: Array<{ ts: string; type: "info" | "command" | "error"; text: string }>;
};
type Blocker = { id: string; title: string; detail: string; oneClickFix?: boolean };
type Diagnostics = {
  ok: boolean;
  blockers: Blocker[];
  tailscale?: {
    ok: boolean;
    installed: boolean;
    running: boolean;
    backendState: string;
    tailnetIp: string;
    tailnetName: string;
    selfDnsName: string;
    relay: "direct" | "derp" | "mixed" | "unknown";
    peersOnline: number;
    detail: string;
    suggestions: Array<{ id: string; title: string; detail: string; oneClickFix?: boolean }>;
  };
};

type CheckState = "pass" | "warn" | "fail" | "pending";
type PreflightCheck = {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  fixLabel?: string;
  fixId?: string;
  action?: "refresh" | "self-test" | "start-device-auth";
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
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState("");

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
    else if (data?.message) setAutonomyMessage(data.message);
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
    setSelfTestMessage(res.ok ? `Codex OK: ${data.working || "unknown"}` : data?.candidates?.[0]?.error || "Codex self-test failed");
    return { ok: res.ok, data };
  }

  async function startDeviceAuth() {
    const res = await fetch("/api/oauth/openai/device/start", { method: "POST" });
    const data = await res.json();
    setPreflightMessage(res.ok ? `Device auth started: ${data.code || "continue in browser"}` : data.message || "Failed to start device auth");
  }

  async function runPreflight() {
    setPreflightBusy(true);
    setPreflightMessage("Running live checks...");
    try {
      await Promise.all([refreshDiagnostics(), refreshAutonomyState(), checkUpdates(), refreshSetup()]);
      const [healthRes, chatRes] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "gpt-5.3-codex", reasoning: "off", messages: [{ role: "user", content: "E2E preflight ping. Reply with one word: pong." }] }),
        }),
      ]);
      const self = await runSelfTest();
      const okCount = [healthRes.ok, chatRes.ok, self.ok].filter(Boolean).length;
      setPreflightMessage(`Preflight done: ${okCount}/3 runtime checks passed`);
    } catch (error) {
      setPreflightMessage(error instanceof Error ? error.message : "Preflight failed");
    } finally {
      setPreflightBusy(false);
    }
  }

  const preflightChecks: PreflightCheck[] = useMemo(() => {
    const blockers = diagnostics?.blockers || [];
    const byId = (id: string) => blockers.find((b) => b.id === id);
    const authReady = Boolean(setup?.oauthConnected || apiKey.trim());
    const tailscaleOk = diagnostics?.tailscale?.ok;

    return [
      {
        id: "chat-runtime",
        label: "Chat + fallback auth",
        state: byId("auth_missing") ? "fail" : authReady ? "pass" : "warn",
        detail: byId("auth_missing") ? "No API key and no connected account" : authReady ? "Auth path present" : "Use API key override or connect OAuth",
      },
      {
        id: "tailscale-connectivity",
        label: "Tailscale connectivity",
        state: tailscaleOk ? "pass" : "warn",
        detail: diagnostics?.tailscale?.detail || "No data",
        fixLabel: "Guidance",
        fixId: "tailscale_connectivity",
      },
      {
        id: "safe-defaults",
        label: "Tailnet-safe autonomy defaults",
        state: byId("tailscale_safe_defaults") ? "warn" : "pass",
        detail: byId("tailscale_safe_defaults")?.detail || "Safe defaults active",
        fixLabel: "Apply safe defaults",
        fixId: "tailscale_safe_defaults",
      },
      {
        id: "update-check",
        label: "Updater endpoint",
        state: updateStatus?.ok ? "pass" : "fail",
        detail: updateStatus?.ok ? `${updateStatus.current} → ${updateStatus.remote}` : updateStatus?.message || "Update status unavailable",
        fixLabel: "Retry",
        fixId: "update_check",
      },
      {
        id: "codex-runtime",
        label: "Codex runtime",
        state: byId("codex_runtime") ? "fail" : selfTestMessage.includes("Codex OK") ? "pass" : "pending",
        detail: byId("codex_runtime")?.detail || selfTestMessage || "Run self-test",
      },
    ];
  }, [diagnostics, setup, updateStatus, apiKey, selfTestMessage]);

  async function handlePreflightAction(check: PreflightCheck) {
    if (check.fixId) {
      await runFix(check.fixId);
      return;
    }
    if (check.action === "self-test") await runSelfTest();
    if (check.action === "start-device-auth") await startDeviceAuth();
    if (check.action === "refresh") await runPreflight();
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
    runPreflight();
    const timer = setInterval(() => refreshAutonomyState(), 2500);
    const preflightTimer = setInterval(() => runPreflight(), 45000);
    return () => {
      clearInterval(timer);
      clearInterval(preflightTimer);
    };
  }, []);

  const theme = themeBg[setup?.theme || "midnight"];

  return (
    <main className={`min-h-screen ${theme} p-4 md:p-6`}>
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-12 gap-4">
        <aside className="md:col-span-3 panel rounded-3xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">VibeForge</h2>
              <p className="text-[11px] text-zinc-400">Codex cockpit</p>
            </div>
            <button onClick={createNewChat} className="btn btn-ghost">New chat</button>
          </div>

          <div className="panel-subtle rounded-2xl p-2 max-h-48 overflow-auto space-y-1">
            {threads.map((t) => (
              <button key={t.id} onClick={() => loadThread(t.id)} className={`thread-item ${activeThreadId === t.id ? "thread-item-active" : ""}`}>
                <span className="truncate">{t.title}</span>
                <span className="text-[10px] text-zinc-400">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="section-label">Model · gpt-5.3-codex</div>
            <div className="grid grid-cols-4 gap-1">
              {(["off", "low", "medium", "high"] as Reasoning[]).map((r) => (
                <button key={r} onClick={() => setReasoning(r)} className={`chip ${reasoning === r ? "chip-active" : ""}`}>
                  {r}
                </button>
              ))}
            </div>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="API key override" className="vf-input" />
          </div>

          <div className="panel-subtle rounded-2xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between text-zinc-300"><span>Updater</span><span>{updateStatus?.hasUpdate ? "Update ready" : "In sync"}</span></div>
            <div className="text-zinc-400">{updateStatus?.current || "..."} → {updateStatus?.remote || "..."}</div>
            <div className="flex gap-2">
              <button onClick={checkUpdates} disabled={updateBusy} className="btn btn-ghost">{updateBusy ? "Checking" : "Check"}</button>
              <button onClick={applyUpdate} disabled={updateBusy} className="btn btn-primary">{updateBusy ? "Updating" : "Update now"}</button>
            </div>
            {updateMessage && <div className="text-zinc-400">{updateMessage}</div>}
          </div>
        </aside>

        <section className="md:col-span-5 panel rounded-3xl p-4 h-[84vh] flex flex-col">
          <h2 className="text-lg font-semibold tracking-tight">Codex Chat</h2>
          <div className="mt-3 flex-1 overflow-auto space-y-2 pr-1">
            {messages.map((m, i) => <div key={i} className={`bubble ${m.role === "user" ? "bubble-user" : "bubble-assistant"}`}><pre className="whitespace-pre-wrap font-mono">{m.content}</pre></div>)}
          </div>
          <div className="mt-3 flex gap-2">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="vf-input h-24" />
            <button onClick={sendPrompt} disabled={loading} className="btn btn-primary">{loading ? "Working..." : "Run"}</button>
          </div>
        </section>

        <section className="md:col-span-4 panel rounded-3xl p-4 h-[84vh] overflow-auto space-y-3">
          <h3 className="font-semibold">Live Code Pane</h3>
          <pre className="rounded-2xl bg-black/50 border border-white/10 p-3 text-xs overflow-auto min-h-40">{latestCodeBlock}</pre>

          <div className="panel-subtle rounded-2xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between"><span className="font-medium">Autonomy</span><div className="flex gap-2"><button onClick={startAutonomy} className="btn btn-primary">Start</button><button onClick={stopAutonomy} className="btn btn-danger">Stop</button></div></div>
            <input value={autonomyGoal} onChange={(e) => setAutonomyGoal(e.target.value)} className="vf-input" />
            <input value={autonomyProjectDir} onChange={(e) => setAutonomyProjectDir(e.target.value)} placeholder="Project dir (optional)" className="vf-input" />
            <label className="flex items-center gap-2 text-zinc-300"><input type="checkbox" checked={allowOutsideStorage} onChange={(e) => setAllowOutsideStorage(e.target.checked)} /> Allow outside install dir</label>
            <div>Status: <span className="text-emerald-300">{autonomyState?.status || "idle"}</span></div>
            <div>Current: {autonomyState?.currentCommand || "-"}</div>
            {autonomyMessage && <div className="text-zinc-300">{autonomyMessage}</div>}
            <div className="max-h-28 overflow-auto space-y-1">{(autonomyState?.activities || []).slice(0, 8).map((a, i) => <div key={i}><span className="text-zinc-500">{new Date(a.ts).toLocaleTimeString()} </span><span className={a.type === "error" ? "text-red-300" : a.type === "command" ? "text-cyan-300" : "text-zinc-300"}>{a.text}</span></div>)}</div>
          </div>

          <div className="panel-subtle rounded-2xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between"><span className="font-medium">Tailscale Connectivity</span><button onClick={refreshDiagnostics} disabled={diagBusy} className="btn btn-ghost">Refresh</button></div>
            <div className="grid grid-cols-2 gap-2 text-zinc-300">
              <div>State: <span className="text-emerald-300">{diagnostics?.tailscale?.backendState || "unknown"}</span></div>
              <div>Path: <span className="text-cyan-300">{diagnostics?.tailscale?.relay || "unknown"}</span></div>
              <div>Tailnet IP: <span className="text-zinc-100">{diagnostics?.tailscale?.tailnetIp || "-"}</span></div>
              <div>Peers online: <span className="text-zinc-100">{diagnostics?.tailscale?.peersOnline ?? 0}</span></div>
            </div>
            <div className="text-zinc-400">{diagnostics?.tailscale?.detail || "No tailscale data yet"}</div>
            <div className="flex gap-2">
              <button onClick={() => runFix("tailscale_connectivity")} className="btn btn-ghost">One-click guidance</button>
              <button onClick={() => runFix("tailscale_safe_defaults")} className="btn btn-ghost">Apply safe defaults</button>
            </div>
            {(diagnostics?.tailscale?.suggestions || []).map((s) => <div key={s.id} className="rounded bg-black/40 p-2 border border-white/10"><div className="text-zinc-100">{s.title}</div><div className="text-zinc-400">{s.detail}</div></div>)}
          </div>

          <div className="panel-subtle rounded-2xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between"><span className="font-medium">E2E Preflight</span><div className="flex gap-2"><button onClick={runPreflight} disabled={preflightBusy} className="btn btn-ghost">{preflightBusy ? "Running" : "Run checks"}</button><button onClick={runSelfTest} className="btn btn-ghost">Codex self-test</button></div></div>
            {preflightMessage && <div className="text-zinc-300">{preflightMessage}</div>}
            <div className="space-y-2">{preflightChecks.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-2"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`status-dot status-${item.state}`} /><span className="font-medium">{item.label}</span></div>{(item.fixId || item.action) && <button onClick={() => handlePreflightAction(item)} className="btn btn-ghost !px-2 !py-1 text-[10px]">{item.fixLabel || "Fix"}</button>}</div><div className="mt-1 text-zinc-400">{item.detail}</div></div>)}</div>
          </div>

          <div className="panel-subtle rounded-2xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between"><span className="font-medium">Diagnostics</span><button onClick={refreshDiagnostics} disabled={diagBusy} className="btn btn-ghost">{diagBusy ? "..." : "Refresh"}</button></div>
            {(diagnostics?.blockers || []).length === 0 ? <div className="text-emerald-300">No blockers detected</div> : diagnostics?.blockers.map((b) => <div key={b.id} className="rounded bg-black/40 p-2 border border-red-400/20"><div className="text-red-300">{b.title}</div><div className="text-zinc-400">{b.detail}</div>{b.oneClickFix && <button onClick={() => runFix(b.id)} className="mt-2 btn btn-ghost !px-2 !py-1 text-[10px]">One-click fix</button>}</div>)}
            {selfTestMessage && <div className="text-zinc-400">{selfTestMessage}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
