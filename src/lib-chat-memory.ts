import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type ChatMessage = { role: "user" | "assistant"; content: string; ts: string };
type ChatThread = { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[] };

type ChatStore = { threads: ChatThread[] };

const DATA_DIR = path.join(process.cwd(), "data");
const CHAT_PATH = path.join(DATA_DIR, "chats.json");
const MEMORY_DIR = path.join(process.cwd(), "memory");

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  if (!fs.existsSync(CHAT_PATH)) fs.writeFileSync(CHAT_PATH, JSON.stringify({ threads: [] }, null, 2));
}

function loadStore(): ChatStore {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(CHAT_PATH, "utf8")) as ChatStore;
  } catch {
    return { threads: [] };
  }
}

function saveStore(store: ChatStore) {
  ensure();
  fs.writeFileSync(CHAT_PATH, JSON.stringify(store, null, 2));
}

export function listThreads() {
  const store = loadStore();
  return store.threads
    .map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt, count: t.messages.length }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function createThread(title?: string) {
  const store = loadStore();
  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: randomUUID(),
    title: title?.trim() || `New chat ${store.threads.length + 1}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  store.threads.unshift(thread);
  saveStore(store);
  return thread;
}

export function getThread(id: string) {
  const store = loadStore();
  return store.threads.find((t) => t.id === id) || null;
}

export function appendMessage(id: string, role: "user" | "assistant", content: string) {
  const store = loadStore();
  const thread = store.threads.find((t) => t.id === id);
  if (!thread) return null;
  const ts = new Date().toISOString();
  thread.messages.push({ role, content, ts });
  thread.updatedAt = ts;
  if (thread.title.startsWith("New chat") && role === "user") {
    thread.title = content.slice(0, 48) || thread.title;
  }
  saveStore(store);
  return thread;
}

export function logMemoryEntry(params: { threadId: string; role: "user" | "assistant"; text: string }) {
  ensure();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const p = path.join(MEMORY_DIR, `${day}.md`);
  const line = `\n### ${now.toISOString()} | ${params.threadId}\n- ${params.role}: ${params.text.replace(/\n/g, " ").slice(0, 1500)}\n`;
  fs.appendFileSync(p, line);
}
