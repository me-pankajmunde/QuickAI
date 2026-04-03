"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SESSIONS_DIR = path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", "QuickAI", "sessions");
const MAX_SESSIONS = 10;
const AUTO_CLEAR_MS = 30 * 60 * 1000; // 30 minutes
class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.timers = new Map();
        this.loadFromDisk();
    }
    get(id) {
        return this.sessions.get(id);
    }
    getAll() {
        return [...this.sessions.values()].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    upsert(session) {
        this.sessions.set(session.id, session);
        this.resetTimer(session.id);
        this.pruneOldSessions();
        this.saveToDisk();
    }
    addMessage(sessionId, message) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        const updated = {
            ...session,
            messages: [...session.messages, message],
            updated_at: new Date().toISOString(),
        };
        this.sessions.set(sessionId, updated);
        this.resetTimer(sessionId);
        this.saveToDisk();
        return updated;
    }
    saveAll(sessions) {
        for (const session of sessions.slice(0, MAX_SESSIONS)) {
            this.sessions.set(session.id, session);
        }
        this.pruneOldSessions();
        this.saveToDisk();
    }
    resetTimer(sessionId) {
        const existing = this.timers.get(sessionId);
        if (existing)
            clearTimeout(existing);
        const timer = setTimeout(() => {
            this.sessions.delete(sessionId);
            this.timers.delete(sessionId);
        }, AUTO_CLEAR_MS);
        this.timers.set(sessionId, timer);
    }
    pruneOldSessions() {
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
    saveToDisk() {
        try {
            fs.mkdirSync(SESSIONS_DIR, { recursive: true });
            const file = path.join(SESSIONS_DIR, "sessions.json");
            const data = JSON.stringify(this.getAll(), null, 2);
            fs.writeFileSync(file, data, "utf-8");
        }
        catch {
            // Non-critical.
        }
    }
    loadFromDisk() {
        try {
            const file = path.join(SESSIONS_DIR, "sessions.json");
            if (!fs.existsSync(file))
                return;
            const raw = fs.readFileSync(file, "utf-8");
            const sessions = JSON.parse(raw);
            for (const s of sessions.slice(0, MAX_SESSIONS)) {
                this.sessions.set(s.id, s);
            }
        }
        catch {
            // Start fresh if file is corrupt.
        }
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=sessionManager.js.map