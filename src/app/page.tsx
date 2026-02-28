"use client";

import { useEffect, useMemo, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };
type SetupStatus = {
  setupCompleted: boolean;
  authMode: "dev-bypass" | "openai-oauth";
  theme: "midnight" | "ocean" | "sunset" | "forest";
  hasOpenAIApiKey: boolean;
  oauthConnected: boolean;
  oauthEmail: string;
  updater: { branch: string; repoPath: string; hasToken: boolean; hasRestartCommand: boolean };
  github: { connected: boolean; owner: string; repo: string; branch: string; defaultPath: string };
  modes: {
    proactive: boolean;
    autonomousEnabled: boolean;
    autonomousRiskLevel: "safe" | "high-risk";
    allowCommandExecution: boolean;
  };
};

type UpdateStatus = {
  ok: boolean;
  current: string;
  remote: string;
  hasUpdate: boolean;
};

const themes = {
  midnight: "bg-zinc-950 text-zinc-100",
  ocean: "bg-slate-950 text-cyan-100",
  sunset: "bg-neutral-950 text-orange-100",
  forest: "bg-zinc-950 text-lime-100",
};

export default function Home() {
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState("http://localhost:3000/api/oauth/openai/callback");

  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [authMode, setAuthMode] = useState<"dev-bypass" | "openai-oauth">("dev-bypass");
  const [theme, setTheme] = useState<"midnight" | "ocean" | "sunset" | "forest">("midnight");
  const [storedApiKey, setStoredApiKey] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [restartCommand, setRestartCommand] = useState("");
  const [updateToken, setUpdateToken] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubPath, setGithubPath] = useState("generated/patch.ts");
  const [proactive, setProactive] = useState(false);
  const [autonomousEnabled, setAutonomousEnabled] = useState(false);
  const [autonomousRisk, setAutonomousRisk] = useState<"safe" | "high-risk">("safe");
  const [allowCommandExecution, setAllowCommandExecution] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  const [githubMessage, setGithubMessage] = useState("");
  const [autonomyGoal, setAutonomyGoal] = useState("");
  const [autonomyMessage, setAutonomyMessage] = useState("");

  const latestCodeBlock = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
    const match = last.match(/```[\s\S]*?\n([\s\S]*?)```/);
    return match?.[1] || "// No code block found yet";
  }, [messages]);

  async function refreshSetup() {
    setSetupLoading(true);
    try {
      const res = await fetch("/api/setup/status", { cache: "no-store" });
      const data = await res.json();
      setSetup(data);
      setAuthMode(data.authMode);
      setTheme(data.theme || "midnight");
      setRepoBranch(data.updater?.branch || "main");
      setRepoPath(data.updater?.repoPath || "");
      setGithubOwner(data.github?.owner || "");
      setGithubRepo(data.github?.repo || "");
      setGithubBranch(data.github?.branch || "main");
      setGithubPath(data.github?.defaultPath || "generated/patch.ts");
      setProactive(Boolean(data.modes?.proactive));
      setAutonomousEnabled(Boolean(data.modes?.autonomousEnabled));
      setAutonomousRisk(data.modes?.autonomousRiskLevel || "safe");
      setAllowCommandExecution(Boolean(data.modes?.allowCommandExecution));
    } finally {
      setSetupLoading(false);
    }
  }

  async function saveSettings() {
    setSaveMessage("");
    const body = {
      authMode,
      theme,
      openaiApiKey: storedApiKey,
      oauth: {
        issuer: "https://auth.openai.com",
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
      },
      updater: { repoPath, branch: repoBranch, restartCommand, token: updateToken },
      github: {
        token: githubToken,
        owner: githubOwner,
        repo: githubRepo,
        branch: githubBranch,
        defaultPath: githubPath,
      },
      modes: {
        proactive,
        autonomousEnabled,
        autonomousRiskLevel: autonomousRisk,
        allowCommandExecution,
      },
    };

    const res = await fetch("/api/setup/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setSaveMessage(data.message || "Failed to save settings");
      return;
    }
    setSaveMessage("Settings saved.");
    await refreshSetup();
  }

  async function sendPrompt() {
    if (!prompt.trim()) return;
    setLoading(true);
    const next = [...messages, { role: "user" as const, content: prompt }];
    setMessages(next);
    setPrompt("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-openai-key": apiKey } : {}),
        },
        body: JSON.stringify({ model, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function checkUpdates() {
    setCheckingUpdate(true);
    setUpdateMessage("");
    const res = await fetch("/api/update/status", { cache: "no-store" });
    const data = await res.json();
    setCheckingUpdate(false);
    if (!res.ok) return setUpdateMessage(data.message || "Failed to check updates");
    setUpdateStatus(data);
  }

  async function applyUpdate() {
    setApplyingUpdate(true);
    setUpdateMessage("");
    const res = await fetch("/api/update/apply", {
      method: "POST",
      headers: updateToken ? { "x-update-token": updateToken } : {},
    });
    const data = await res.json();
    setApplyingUpdate(false);
    if (!res.ok) return setUpdateMessage(data.message || "Update failed");
    setUpdateMessage(data.message || "Updated.");
    await checkUpdates();
  }

  async function connectGithub() {
    setGithubMessage("");
    await saveSettings();
    const res = await fetch("/api/github/connect", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setGithubMessage(data.message || "GitHub connection failed");
    setGithubMessage(`Connected as ${data.login} to ${data.owner}/${data.repo}`);
    await refreshSetup();
  }

  async function pushToGithub() {
    setGithubMessage("");
    const res = await fetch("/api/github/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: githubPath || "generated/patch.ts",
        content: latestCodeBlock,
        message: `feat: update ${githubPath || "generated/patch.ts"} from VibeForge`,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setGithubMessage(data.message || "GitHub push failed");
    setGithubMessage(`Pushed ${data.path} · commit ${data.commit}`);
  }

  async function runAutonomy(execute: boolean) {
    setAutonomyMessage("");
    const res = await fetch("/api/autonomy/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: autonomyGoal, execute }),
    });
    const data = await res.json();
    if (!res.ok) return setAutonomyMessage(data.message || "Autonomous run failed");
    setAutonomyMessage(`${data.summary}\nTasks: ${(data.tasks || []).join(", ")}\n${data.warning || ""}`);
  }

  useEffect(() => {
    refreshSetup();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOauthRedirectUrl(`${window.location.origin}/api/oauth/openai/callback`);
    }
  }, []);

  useEffect(() => {
    if (setup?.setupCompleted) checkUpdates();
  }, [setup?.setupCompleted]);

  if (setupLoading) {
    return <main className="min-h-screen bg-zinc-950 text-zinc-300 grid place-items-center">Loading...</main>;
  }

  const currentTheme = themes[setup?.theme || theme || "midnight"];

  if (!setup?.setupCompleted) {
    return (
      <main className={`min-h-screen ${currentTheme} p-6 grid place-items-center`}>
        <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h1 className="text-2xl font-semibold">VibeForge Onboarding</h1>
          <p className="text-sm text-zinc-400">Configure everything once. No manual env editing needed.</p>
          <SettingsForm
            authMode={authMode}
            setAuthMode={setAuthMode}
            theme={theme}
            setTheme={setTheme}
            storedApiKey={storedApiKey}
            setStoredApiKey={setStoredApiKey}            oauthClientId={oauthClientId}
            setOauthClientId={setOauthClientId}
            oauthClientSecret={oauthClientSecret}
            setOauthClientSecret={setOauthClientSecret}
            oauthRedirectUrl={oauthRedirectUrl}
            repoPath={repoPath}
            setRepoPath={setRepoPath}
            repoBranch={repoBranch}
            setRepoBranch={setRepoBranch}
            restartCommand={restartCommand}
            setRestartCommand={setRestartCommand}
            updateToken={updateToken}
            setUpdateToken={setUpdateToken}
            githubToken={githubToken}
            setGithubToken={setGithubToken}
            githubOwner={githubOwner}
            setGithubOwner={setGithubOwner}
            githubRepo={githubRepo}
            setGithubRepo={setGithubRepo}
            githubBranch={githubBranch}
            setGithubBranch={setGithubBranch}
            githubPath={githubPath}
            setGithubPath={setGithubPath}
            proactive={proactive}
            setProactive={setProactive}
            autonomousEnabled={autonomousEnabled}
            setAutonomousEnabled={setAutonomousEnabled}
            autonomousRisk={autonomousRisk}
            setAutonomousRisk={setAutonomousRisk}
            allowCommandExecution={allowCommandExecution}
            setAllowCommandExecution={setAllowCommandExecution}
          />
          <button onClick={saveSettings} className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black">
            Complete onboarding
          </button>
          {saveMessage && <p className="text-xs text-zinc-300">{saveMessage}</p>}
        </div>
      </main>
    );
  }

  const requiresOAuth = setup.authMode === "openai-oauth";
  if (requiresOAuth && !setup.oauthConnected) {
    return (
      <main className={`min-h-screen ${currentTheme} grid place-items-center p-6`}>
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-3">
          <h1 className="text-2xl font-semibold">VibeForge</h1>
          <p className="text-sm text-zinc-400">Connect your OpenAI account to continue.</p>
          <a href="/api/oauth/openai/start" className="block w-full text-center rounded-xl bg-emerald-500 px-4 py-2 text-black font-medium">
            Connect with OpenAI
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen ${currentTheme} p-4 md:p-6`}>
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-12 gap-4">
        <aside className="md:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">VibeForge</h2>
            <button onClick={() => setShowSettings(true)} className="text-xs rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800">Settings</button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg bg-zinc-800 px-3 py-2">Current session</div>
            <div className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-400">Agent tasks</div>
            <div className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-400">GitHub queue</div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg bg-zinc-800 p-2 text-sm">
              <option>gpt-4o-mini</option>
              <option>gpt-4o</option>
              <option>gpt-5-mini</option>
              <option>gpt-5</option>
            </select>
            <label className="text-xs text-zinc-400">Session OpenAI key override</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="Optional" className="w-full rounded-lg bg-zinc-800 p-2 text-sm" />
          </div>

          <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Updates</h3>
              <span className="text-xs text-zinc-400">{updateStatus?.hasUpdate ? "available" : "up to date"}</span>
            </div>
            <p className="text-xs text-zinc-400">Local {updateStatus?.current || "..."} · Remote {updateStatus?.remote || "..."}</p>
            <div className="flex gap-2">
              <button onClick={checkUpdates} disabled={checkingUpdate} className="text-xs rounded border border-zinc-700 px-2 py-1">{checkingUpdate ? "Checking..." : "Check"}</button>
              <button onClick={applyUpdate} disabled={!updateStatus?.hasUpdate || applyingUpdate} className="text-xs rounded bg-emerald-500 px-2 py-1 text-black">{applyingUpdate ? "Updating..." : "Update now"}</button>
            </div>
            {updateMessage && <p className="text-xs text-zinc-300">{updateMessage}</p>}
          </div>

          {requiresOAuth && (
            <div className="text-xs text-zinc-400">Connected as {setup.oauthEmail || "OpenAI account"}</div>
          )}
        </aside>

        <section className="md:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 h-[82vh] flex flex-col">
          <h2 className="font-semibold">Codex-style Chat</h2>
          <div className="mt-3 flex-1 overflow-auto space-y-3 pr-1">
            {messages.length === 0 && <div className="rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400">Ask for architecture, code generation, refactors, docs, tests.</div>}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl p-3 ${m.role === "user" ? "bg-zinc-800" : "bg-zinc-950 border border-zinc-800"}`}>
                <div className="text-[11px] text-zinc-400 mb-1">{m.role === "user" ? "You" : "Assistant"}</div>
                <pre className="whitespace-pre-wrap text-xs font-mono">{m.content}</pre>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe what to build..." className="flex-1 h-24 rounded-xl bg-zinc-800 p-3 text-sm" />
            <button onClick={sendPrompt} disabled={loading} className="rounded-xl bg-emerald-500 px-4 py-2 text-black font-medium">{loading ? "Thinking..." : "Send"}</button>
          </div>
        </section>

        <section className="md:col-span-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 h-[82vh] overflow-auto space-y-4">
          <div>
            <h2 className="font-semibold">Code + Actions</h2>
            <p className="text-xs text-zinc-400">Latest code block from assistant output</p>
            <pre className="mt-2 rounded-xl border border-zinc-800 bg-black p-3 text-xs overflow-auto">{latestCodeBlock}</pre>
          </div>

          <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <h3 className="text-sm font-medium">GitHub</h3>
            <button onClick={connectGithub} className="text-xs rounded border border-zinc-700 px-2 py-1">Connect / Validate</button>
            <button onClick={pushToGithub} className="ml-2 text-xs rounded bg-emerald-500 px-2 py-1 text-black">Push code block</button>
            {githubMessage && <p className="text-xs text-zinc-300">{githubMessage}</p>}
          </div>

          <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <h3 className="text-sm font-medium">Autonomous Mode</h3>
            <textarea value={autonomyGoal} onChange={(e) => setAutonomyGoal(e.target.value)} placeholder="Give a goal for autonomous execution..." className="w-full h-24 rounded-lg bg-zinc-800 p-2 text-xs" />
            <div className="flex gap-2">
              <button onClick={() => runAutonomy(false)} className="text-xs rounded border border-zinc-700 px-2 py-1">Plan only</button>
              <button onClick={() => runAutonomy(true)} className="text-xs rounded bg-red-500 px-2 py-1 text-black">Execute high-risk</button>
            </div>
            <p className="text-[11px] text-zinc-500">High-risk execute only works if enabled in settings.</p>
            {autonomyMessage && <pre className="text-xs whitespace-pre-wrap text-zinc-300">{autonomyMessage}</pre>}
          </div>
        </section>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm p-4 overflow-auto">
          <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Settings</h2>
              <button onClick={() => setShowSettings(false)} className="rounded border border-zinc-700 px-2 py-1 text-xs">Close</button>
            </div>
            <SettingsForm
              authMode={authMode}
              setAuthMode={setAuthMode}
              theme={theme}
              setTheme={setTheme}
              storedApiKey={storedApiKey}
              setStoredApiKey={setStoredApiKey}              oauthClientId={oauthClientId}
              setOauthClientId={setOauthClientId}
              oauthClientSecret={oauthClientSecret}
              setOauthClientSecret={setOauthClientSecret}
            oauthRedirectUrl={oauthRedirectUrl}
            repoPath={repoPath}
              setRepoPath={setRepoPath}
              repoBranch={repoBranch}
              setRepoBranch={setRepoBranch}
              restartCommand={restartCommand}
              setRestartCommand={setRestartCommand}
              updateToken={updateToken}
              setUpdateToken={setUpdateToken}
              githubToken={githubToken}
              setGithubToken={setGithubToken}
              githubOwner={githubOwner}
              setGithubOwner={setGithubOwner}
              githubRepo={githubRepo}
              setGithubRepo={setGithubRepo}
              githubBranch={githubBranch}
              setGithubBranch={setGithubBranch}
              githubPath={githubPath}
              setGithubPath={setGithubPath}
              proactive={proactive}
              setProactive={setProactive}
              autonomousEnabled={autonomousEnabled}
              setAutonomousEnabled={setAutonomousEnabled}
              autonomousRisk={autonomousRisk}
              setAutonomousRisk={setAutonomousRisk}
              allowCommandExecution={allowCommandExecution}
              setAllowCommandExecution={setAllowCommandExecution}
            />
            <div className="flex items-center gap-2">
              <button onClick={saveSettings} className="rounded bg-emerald-500 px-3 py-1 text-black text-sm font-medium">Save settings</button>
              {saveMessage && <span className="text-xs text-zinc-300">{saveMessage}</span>}
              {requiresOAuth && (
                <button
                  onClick={async () => { await fetch("/api/oauth/openai/disconnect", { method: "POST" }); await refreshSetup(); }}
                  className="rounded border border-zinc-700 px-3 py-1 text-xs"
                >Disconnect OpenAI</button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SettingsForm(props: any) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-2">
        <select value={props.theme} onChange={(e) => props.setTheme(e.target.value)} className="rounded-lg bg-zinc-800 p-2 text-sm">
          <option value="midnight">Theme: Midnight</option>
          <option value="ocean">Theme: Ocean</option>
          <option value="sunset">Theme: Sunset</option>
          <option value="forest">Theme: Forest</option>
        </select>
        <select value={props.authMode} onChange={(e) => props.setAuthMode(e.target.value)} className="rounded-lg bg-zinc-800 p-2 text-sm">
          <option value="dev-bypass">Auth: Local mode</option>
          <option value="openai-oauth">Auth: OpenAI OAuth</option>
        </select>
        <input type="password" value={props.storedApiKey} onChange={(e) => props.setStoredApiKey(e.target.value)} placeholder="Default OpenAI API key" className="rounded-lg bg-zinc-800 p-2 text-sm" />
      </div>

      {props.authMode === "openai-oauth" && (
        <div className="rounded-lg border border-zinc-800 p-3 text-xs text-zinc-300 space-y-2">
          <div>One-click flow enabled. Click <b>Connect with OpenAI</b> on login screen.</div>
          <div>If provider requires callback allowlist, use:</div>
          <code className="text-emerald-300">{props.oauthRedirectUrl}</code>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-2">
        <input value={props.repoPath} onChange={(e) => props.setRepoPath(e.target.value)} placeholder="Updater repo path" className="rounded-lg bg-zinc-800 p-2 text-sm" />
        <input value={props.repoBranch} onChange={(e) => props.setRepoBranch(e.target.value)} placeholder="Updater branch" className="rounded-lg bg-zinc-800 p-2 text-sm" />
        <input value={props.restartCommand} onChange={(e) => props.setRestartCommand(e.target.value)} placeholder="Updater restart command" className="rounded-lg bg-zinc-800 p-2 text-sm" />
        <input type="password" value={props.updateToken} onChange={(e) => props.setUpdateToken(e.target.value)} placeholder="Updater token (optional)" className="rounded-lg bg-zinc-800 p-2 text-sm" />
      </div>

      <div className="grid md:grid-cols-2 gap-2">
        <input type="password" value={props.githubToken} onChange={(e) => props.setGithubToken(e.target.value)} placeholder="GitHub token" className="rounded-lg bg-zinc-800 p-2 text-sm" />
        <input value={props.githubOwner} onChange={(e) => props.setGithubOwner(e.target.value)} placeholder="GitHub owner" className="rounded-lg bg-zinc-800 p-2 text-sm" />
        <input value={props.githubRepo} onChange={(e) => props.setGithubRepo(e.target.value)} placeholder="GitHub repo" className="rounded-lg bg-zinc-800 p-2 text-sm" />
        <input value={props.githubBranch} onChange={(e) => props.setGithubBranch(e.target.value)} placeholder="GitHub branch" className="rounded-lg bg-zinc-800 p-2 text-sm" />
        <input value={props.githubPath} onChange={(e) => props.setGithubPath(e.target.value)} placeholder="Default push path" className="rounded-lg bg-zinc-800 p-2 text-sm md:col-span-2" />
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <label className="text-xs p-2 rounded border border-zinc-800 flex items-center gap-2"><input type="checkbox" checked={props.proactive} onChange={(e) => props.setProactive(e.target.checked)} /> Proactive mode</label>
        <label className="text-xs p-2 rounded border border-zinc-800 flex items-center gap-2"><input type="checkbox" checked={props.autonomousEnabled} onChange={(e) => props.setAutonomousEnabled(e.target.checked)} /> Autonomous mode</label>
        <label className="text-xs p-2 rounded border border-zinc-800 flex items-center gap-2"><input type="checkbox" checked={props.allowCommandExecution} onChange={(e) => props.setAllowCommandExecution(e.target.checked)} /> Allow command execution</label>
      </div>
      <select value={props.autonomousRisk} onChange={(e) => props.setAutonomousRisk(e.target.value)} className="rounded-lg bg-zinc-800 p-2 text-sm">
        <option value="safe">Autonomous risk: safe</option>
        <option value="high-risk">Autonomous risk: high-risk</option>
      </select>
      <p className="text-[11px] text-amber-300">High-risk + command execution allows AI-generated shell commands to run. Use only on trusted environments.</p>
    </div>
  );
}
