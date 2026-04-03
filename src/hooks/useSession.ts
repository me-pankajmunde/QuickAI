import { useState, useCallback, useRef } from "react";
import type { Session, AgentMode, ChatMessage } from "../types";

const AGENT_BASE_URL = "http://localhost:3001";
const MAX_HISTORY = 10;

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function useSession() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const currentRef = useRef<Session | null>(null);

  currentRef.current = currentSession;

  const createSession = useCallback(
    (mode: AgentMode = "generate", workspaceRoot = "~/Projects"): Session => {
      const session: Session = {
        id: generateId(),
        name: `Session ${new Date().toLocaleTimeString()}`,
        created_at: now(),
        updated_at: now(),
        messages: [],
        workspace_root: workspaceRoot,
        mode,
      };

      setSessions((prev) => {
        const updated = [session, ...prev].slice(0, MAX_HISTORY);
        persistSessions(updated);
        return updated;
      });
      setCurrentSession(session);
      return session;
    },
    []
  );

  const addMessage = useCallback((message: ChatMessage) => {
    setCurrentSession((prev) => {
      if (!prev) return prev;
      const updated: Session = {
        ...prev,
        messages: [...prev.messages, message],
        updated_at: now(),
      };
      setSessions((sessions) => {
        const next = sessions.map((s) => (s.id === updated.id ? updated : s));
        persistSessions(next);
        return next;
      });
      return updated;
    });
  }, []);

  const clearSession = useCallback(() => {
    if (currentRef.current) {
      const mode = currentRef.current.mode;
      const root = currentRef.current.workspace_root;
      createSession(mode, root);
    }
  }, [createSession]);

  const switchSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const target = prev.find((s) => s.id === sessionId);
      if (target) setCurrentSession(target);
      return prev;
    });
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch(`${AGENT_BASE_URL}/sessions`);
      if (response.ok) {
        const data = (await response.json()) as Session[];
        setSessions(data.slice(0, MAX_HISTORY));
        if (data.length > 0) setCurrentSession(data[0]);
      }
    } catch {
      // Sidecar may not be running; start with empty state.
    }
  }, []);

  const ensureSession = useCallback(
    (mode: AgentMode, workspaceRoot: string): Session => {
      if (currentRef.current) return currentRef.current;
      return createSession(mode, workspaceRoot);
    },
    [createSession]
  );

  return {
    sessions,
    currentSession,
    createSession,
    clearSession,
    switchSession,
    loadSessions,
    addMessage,
    ensureSession,
  };
}

async function persistSessions(sessions: Session[]): Promise<void> {
  try {
    await fetch(`${AGENT_BASE_URL}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessions),
    });
  } catch {
    // Non-critical; sessions survive in memory.
  }
}
