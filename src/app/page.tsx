"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type ChatMsg = { role: "user" | "assistant"; content: string };
type ToolCall = { name: string; status: "done" | "running"; detail: string };
type RepoUpdateStatus = {
  ok: boolean;
  current: string;
  remote: string;
  hasUpdate: boolean;
  branch: string;
  repoPath: string;
  message?: string;
};

type SetupStatus = {
  setupCompleted: boolean;
  authMode: "dev-bypass" | "openai-oauth";
  hasOpenAIApiKey: boolean;
  oauthConfigured: boolean;
  updater: {
    branch: string;
    repoPath: string;
    hasToken: boolean;
    hasRestartCommand: boolean;
  };
};

export default function Home() {
  const { data: session, status } = useSession();
  const [apiKey, setApiKey] = useState("");
  const [updateToken, setUpdateToken] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);

  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupSaving, setSetupSaving] = useState(false);

  const [authMode, setAuthMode] = useState<"dev-bypass" | "openai-oauth">("dev-bypass");
  const [storedApiKey, setStoredApiKey] = useState("");
  const [oauthIssuer, setOauthIssuer] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthAuthUrl, setOauthAuthUrl] = useState("");
  const [oauthTokenUrl, setOauthTokenUrl] = useState("");
  const [oauthUserInfoUrl, setOauthUserInfoUrl] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [restartCommand, setRestartCommand] = useState("");
  const [setupMessage, setSetupMessage] = useState("");

  const [updateStatus, setUpdateStatus] = useState<RepoUpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string>("");

  const latestCodeBlock = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return "// No code output yet";
    const match = last.content.match(/```[\s\S]*?\n([\s\S]*?)```/);
    return match?.[1] || "// No code block found in last assistant response";
  }, [messages]);

  const toolFeed: ToolCall[] = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
    return [
      { name: "Planner", status: loading ? "running" : "done", detail: loading ? "Analyzing request..." : "Prompt parsed" },
      { name: "Coder", status: loading ? "running" : "done", detail: loading ? "Generating implementation..." : "Implementation generated" },
      { name: "Patch", status: loading ? "running" : "done", detail: lastAssistant.includes("```") ? "Code snippets available" : "No code snippets yet" },
    ];
  }, [loading, messages]);

  async function loadSetupStatus() {
    setSetupLoading(true);
    try {
      const res = await fetch("/api/setup/status", { cache: "no-store" });
      const data = await res.json();
      setSetupStatus(data);
      setAuthMode(data.authMode || "dev-bypass");
      setRepoBranch(data.updater?.branch || "main");
      setRepoPath(data.updater?.repoPath || "");
    } finally {
      setSetupLoading(false);
    }
  }

  async function saveSetup() {
    setSetupSaving(true);
    setSetupMessage("");
    try {
      const res = await fetch("/api/setup/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authMode,
          openaiApiKey: storedApiKey,
          oauth: {
            issuer: oauthIssuer,
            clientId: oauthClientId,
            clientSecret: oauthClientSecret,
            authUrl: oauthAuthUrl,
            tokenUrl: oauthTokenUrl,
            userinfoUrl: oauthUserInfoUrl,
          },
          updater: {
            repoPath,
            branch: repoBranch,
            restartCommand,
            token: updateToken,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save setup");
      setSetupMessage("Setup saved. You can start using the app now.");
      await loadSetupStatus();
      await checkForUpdates();
    } catch (err) {
      setSetupMessage(`Setup failed: ${(err as Error).message}`);
    } finally {
      setSetupSaving(false);
    }
  }

  async function checkForUpdates() {
    setCheckingUpdate(true);
    setUpdateMessage("");
    try {
      const res = await fetch("/api/update/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to check updates");
      setUpdateStatus(data);
    } catch (err) {
      setUpdateMessage(`Update check failed: ${(err as Error).message}`);
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function applyRepoUpdate() {
    setApplyingUpdate(true);
    setUpdateMessage("");
    try {
      const res = await fetch("/api/update/apply", {
        method: "POST",
        headers: {
          ...(updateToken ? { "x-update-token": updateToken } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to apply update");
      setUpdateMessage(data.message || "Update applied.");
      await checkForUpdates();
    } catch (err) {
      setUpdateMessage(`Update failed: ${(err as Error).message}`);
    } finally {
      setApplyingUpdate(false);
    }
  }

  useEffect(() => {
    loadSetupStatus();
  }, []);

  useEffect(() => {
    if (!setupStatus?.setupCompleted) return;
    checkForUpdates();
    const interval = setInterval(checkForUpdates, 60_000);
    return () => clearInterval(interval);
  }, [setupStatus?.setupCompleted]);

  async function sendPrompt() {
    if (!prompt.trim()) return;
    if (!apiKey && !setupStatus?.hasOpenAIApiKey) return;

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
        body: JSON.stringify({ model, messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${(err as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  }

  if (setupLoading || (status === "loading" && setupStatus?.authMode === "openai-oauth")) {
    return <main className="p-8 text-zinc-300">Loading...</main>;
  }

  if (!setupStatus?.setupCompleted) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 grid place-items-center">
        <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h1 className="text-2xl font-semibold">Welcome to VibeForge</h1>
          <p className="text-sm text-zinc-400">One-time onboarding. Configure everything here instead of editing env files.</p>

          <div className="grid gap-2">
            <label className="text-xs text-zinc-400">Auth mode</label>
            <select value={authMode} onChange={(e) => setAuthMode(e.target.value as any)} className="rounded-lg bg-zinc-800 p-2 text-sm">
              <option value="dev-bypass">Local mode (no login)</option>
              <option value="openai-oauth">OpenAI OAuth login</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-xs text-zinc-400">Default OpenAI API key (optional)</label>
            <input type="password" value={storedApiKey} onChange={(e) => setStoredApiKey(e.target.value)} placeholder="sk-..." className="rounded-lg bg-zinc-800 p-2 text-sm" />
          </div>

          {authMode === "openai-oauth" && (
            <div className="grid md:grid-cols-2 gap-2">
              <input value={oauthIssuer} onChange={(e) => setOauthIssuer(e.target.value)} placeholder="OAuth issuer" className="rounded-lg bg-zinc-800 p-2 text-sm" />
              <input value={oauthClientId} onChange={(e) => setOauthClientId(e.target.value)} placeholder="OAuth client id" className="rounded-lg bg-zinc-800 p-2 text-sm" />
              <input type="password" value={oauthClientSecret} onChange={(e) => setOauthClientSecret(e.target.value)} placeholder="OAuth client secret" className="rounded-lg bg-zinc-800 p-2 text-sm" />
              <input value={oauthAuthUrl} onChange={(e) => setOauthAuthUrl(e.target.value)} placeholder="Authorization URL" className="rounded-lg bg-zinc-800 p-2 text-sm" />
              <input value={oauthTokenUrl} onChange={(e) => setOauthTokenUrl(e.target.value)} placeholder="Token URL" className="rounded-lg bg-zinc-800 p-2 text-sm" />
              <input value={oauthUserInfoUrl} onChange={(e) => setOauthUserInfoUrl(e.target.value)} placeholder="Userinfo URL" className="rounded-lg bg-zinc-800 p-2 text-sm" />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-2">
            <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="Repo path (optional)" className="rounded-lg bg-zinc-800 p-2 text-sm" />
            <input value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="Update branch (main)" className="rounded-lg bg-zinc-800 p-2 text-sm" />
            <input value={restartCommand} onChange={(e) => setRestartCommand(e.target.value)} placeholder="Restart command (optional)" className="rounded-lg bg-zinc-800 p-2 text-sm md:col-span-2" />
          </div>

          <button onClick={saveSetup} disabled={setupSaving} className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black disabled:opacity-50">{setupSaving ? "Saving..." : "Complete onboarding"}</button>
          {setupMessage && <p className="text-xs text-zinc-300">{setupMessage}</p>}
        </div>
      </main>
    );
  }

  const requiresOAuth = setupStatus.authMode === "openai-oauth";
  const isLoggedIn = !requiresOAuth || !!session;

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white grid place-items-center p-8">
        <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h1 className="text-2xl font-semibold">VibeForge</h1>
          <p className="text-zinc-400 text-sm">Sign in with OpenAI OAuth to continue.</p>
          <button onClick={() => signIn("openai")} className="w-full rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black hover:bg-emerald-400">Continue with OpenAI</button>
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
            <p className="mt-2 text-xs text-zinc-400">{requiresOAuth ? `Signed in as ${session?.user?.name || session?.user?.email}` : "Running in local mode"}</p>
            {requiresOAuth && <button onClick={() => signOut()} className="mt-3 rounded-lg border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Sign out</button>}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg bg-zinc-800 p-2 text-sm">
              <option>gpt-4o-mini</option><option>gpt-4o</option><option>gpt-5-mini</option><option>gpt-5</option>
            </select>

            <label className="text-xs text-zinc-400">OpenAI API key (session override)</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={setupStatus?.hasOpenAIApiKey ? "Optional (already configured in onboarding)" : "sk-..."} className="w-full rounded-lg bg-zinc-800 p-2 text-sm" />
          </div>

          <div className="space-y-2 rounded-xl border border-zinc-800 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">App Updates</h3>
              {updateStatus?.hasUpdate ? <span className="text-[10px] rounded bg-emerald-900/60 px-2 py-1 text-emerald-300">Update available</span> : <span className="text-[10px] rounded bg-zinc-800 px-2 py-1 text-zinc-400">Up to date</span>}
            </div>
            <p className="text-xs text-zinc-400">Current: {updateStatus?.current || "..."} · Remote: {updateStatus?.remote || "..."}</p>
            <div className="flex gap-2">
              <button onClick={checkForUpdates} disabled={checkingUpdate} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50">{checkingUpdate ? "Checking..." : "Check"}</button>
              <button onClick={applyRepoUpdate} disabled={applyingUpdate || !updateStatus?.hasUpdate} className="rounded-lg bg-emerald-500 px-2 py-1 text-xs text-black disabled:opacity-50">{applyingUpdate ? "Updating..." : "Update now"}</button>
            </div>
            <input type="password" value={updateToken} onChange={(e) => setUpdateToken(e.target.value)} placeholder="Optional update token" className="w-full rounded-lg bg-zinc-800 p-2 text-xs" />
            {updateMessage && <p className="text-xs text-zinc-300">{updateMessage}</p>}
          </div>
        </section>

        <section className="md:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col h-[80vh]">
          <h2 className="font-semibold">Chat</h2>
          <div className="mt-3 flex-1 overflow-auto space-y-3 pr-1">
            {messages.length === 0 && <div className="rounded-xl border border-zinc-800 p-3 text-xs text-zinc-400">Ask for features, refactors, tests, docs, or full file patches.</div>}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl p-3 text-sm ${m.role === "user" ? "bg-zinc-800" : "bg-zinc-950 border border-zinc-800"}`}>
                <div className="mb-1 text-xs text-zinc-400">{m.role === "user" ? "You" : "Assistant"}</div>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{m.content}</pre>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe what you want to build..." className="h-24 flex-1 rounded-xl bg-zinc-800 p-3 text-sm" />
            <button onClick={sendPrompt} disabled={loading} className="rounded-xl bg-emerald-500 px-4 py-3 font-medium text-black disabled:opacity-50">{loading ? "Thinking..." : "Send"}</button>
          </div>
        </section>

        <section className="md:col-span-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-[80vh] overflow-auto">
          <h2 className="font-semibold">Tools & Code</h2>
          <div className="mt-3 space-y-2">
            {toolFeed.map((tool) => (
              <div key={tool.name} className="rounded-lg border border-zinc-800 p-2">
                <div className="flex items-center justify-between text-sm"><span>{tool.name}</span><span className={tool.status === "running" ? "text-amber-300" : "text-emerald-300"}>{tool.status}</span></div>
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
