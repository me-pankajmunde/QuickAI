import * as fs from "fs";
import * as path from "path";
import { getHomeDir } from "./filesystem";
import type { ChatMessage } from "./llmProvider";

export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
  workspace_root: string;
  detected_language?: string;
  mode: string;
}

const SESSIONS_DIR = path.join(getHomeDir(), "QuickAI", "sessions");

const MAX_SESSIONS = 10;
const AUTO_CLEAR_MS = 30 * 60 * 1000; // 30 minutes

export class SessionManager {
  private sessions = new Map<string, Session>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.loadFromDisk();
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getAll(): Session[] {
    return [...this.sessions.values()].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  upsert(session: Session): void {
    this.sessions.set(session.id, session);
    this.resetTimer(session.id);
    this.pruneOldSessions();
    this.saveToDisk();
  }

  addMessage(sessionId: string, message: ChatMessage): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updated: Session = {
      ...session,
      messages: [...session.messages, message],
      updated_at: new Date().toISOString(),
    };

    this.sessions.set(sessionId, updated);
    this.resetTimer(sessionId);
    this.saveToDisk();
    return updated;
  }

  saveAll(sessions: Session[]): void {
    for (const session of sessions.slice(0, MAX_SESSIONS)) {
      this.sessions.set(session.id, session);
    }
    this.pruneOldSessions();
    this.saveToDisk();
  }

  private resetTimer(sessionId: string): void {
    const existing = this.timers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.sessions.delete(sessionId);
      this.timers.delete(sessionId);
    }, AUTO_CLEAR_MS);

    this.timers.set(sessionId, timer);
  }

  private pruneOldSessions(): void {
    const all = this.getAll();
    if (all.length > MAX_SESSIONS) {
      const toRemove = all.slice(MAX_SESSIONS);
      for (const s of toRemove) {
        this.sessions.delete(s.id);
        const timer = this.timers.get(s.id);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(s.id);
        }
      }
    }
  }

  private saveToDisk(): void {
    try {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      const file = path.join(SESSIONS_DIR, "sessions.json");
      const data = JSON.stringify(this.getAll(), null, 2);
      fs.writeFileSync(file, data, "utf-8");
    } catch {
      // Non-critical.
    }
  }

  private loadFromDisk(): void {
    try {
      const file = path.join(SESSIONS_DIR, "sessions.json");
      if (!fs.existsSync(file)) return;
      const raw = fs.readFileSync(file, "utf-8");
      const sessions = JSON.parse(raw) as Session[];
      for (const s of sessions.slice(0, MAX_SESSIONS)) {
        this.sessions.set(s.id, s);
      }
    } catch {
      // Start fresh if file is corrupt.
    }
  }
}
