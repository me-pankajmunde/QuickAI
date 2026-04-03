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
export declare class SessionManager {
    private sessions;
    private timers;
    constructor();
    get(id: string): Session | undefined;
    getAll(): Session[];
    upsert(session: Session): void;
    addMessage(sessionId: string, message: ChatMessage): Session | null;
    saveAll(sessions: Session[]): void;
    private resetTimer;
    private pruneOldSessions;
    private saveToDisk;
    private loadFromDisk;
}
//# sourceMappingURL=sessionManager.d.ts.map