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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const codingAgent_1 = require("./codingAgent");
const languageDetector_1 = require("./languageDetector");
// ─── Default config ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    agent_id: "coder",
    display_name: "Coding Agent",
    icon: "code-bracket",
    hotkey: "Ctrl+Shift+C",
    system_prompt: "You are a senior software engineer assistant. You write clean, " +
        "well-documented, production-quality code. You explain concepts clearly " +
        "and provide actionable debugging advice. Always follow best practices " +
        "for the language/framework being used.",
    tools: ["Bash", "Read", "Edit"],
    filesystem: {
        enabled: true,
        workspace_root: path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", "Projects"),
        deny_list: [
            "~/.ssh",
            "~/.aws",
            "~/.gnupg",
            "~/.config/credentials",
            "/etc",
            "/proc",
            "/sys",
        ],
        write_requires_confirmation: true,
    },
    mcp_servers: [],
    llm: {
        primary: {
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
        },
        fallback: {
            provider: "ollama",
            model: "codellama:13b",
            max_tokens: 2048,
        },
    },
    output_defaults: {
        syntax_highlighting: true,
        line_numbers: true,
        diff_view: false,
    },
    session: {
        persist_context: true,
        max_history_sessions: 10,
        auto_clear_after_minutes: 30,
    },
};
// ─── Load config from disk ────────────────────────────────────────────────────
function loadConfig() {
    const configDir = path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", "QuickAI", "agents");
    const configFile = path.join(configDir, "coder.json");
    try {
        if (fs.existsSync(configFile)) {
            const raw = fs.readFileSync(configFile, "utf-8");
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        }
    }
    catch {
        console.warn("[config] Failed to load coder.json; using defaults.");
    }
    // Write default config for first-time users
    try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(configFile, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    }
    catch {
        // Non-critical.
    }
    return DEFAULT_CONFIG;
}
// ─── Bootstrap ────────────────────────────────────────────────────────────────
const config = loadConfig();
const agent = new codingAgent_1.CodingAgent(config);
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: ["http://localhost:1420", "tauri://localhost"] }));
app.use(express_1.default.json({ limit: "2mb" }));
// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0" });
});
// ─── Language detection ───────────────────────────────────────────────────────
app.post("/language/detect", (req, res) => {
    const { code, filename } = req.body;
    if (!code) {
        res.status(400).json({ error: "code is required" });
        return;
    }
    const result = (0, languageDetector_1.detectLanguage)(code, filename);
    res.json(result);
});
// ─── Filesystem check ─────────────────────────────────────────────────────────
app.get("/filesystem/check", (req, res) => {
    const { path: checkPath } = req.query;
    if (!checkPath) {
        res.status(400).json({ error: "path is required" });
        return;
    }
    const fs_manager = agent.getFilesystemManager();
    const accessible = fs_manager.checkAccess(checkPath);
    res.json({ accessible, workspace_root: fs_manager.getWorkspaceRoot() });
});
// ─── Sessions ─────────────────────────────────────────────────────────────────
app.get("/sessions", (_req, res) => {
    const sessions = agent.getSessionManager().getAll();
    res.json(sessions);
});
app.post("/sessions", (req, res) => {
    const sessions = req.body;
    if (!Array.isArray(sessions)) {
        res.status(400).json({ error: "body must be an array of sessions" });
        return;
    }
    agent.getSessionManager().saveAll(sessions);
    res.json({ saved: sessions.length });
});
// ─── Streaming agent endpoint ─────────────────────────────────────────────────
app.post("/agent/stream", async (req, res) => {
    const agentReq = req.body;
    if (!agentReq.mode) {
        res.status(400).json({ error: "mode is required" });
        return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const write = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    let finalProvider = "anthropic";
    let finalFallback = false;
    let sessionId = agentReq.session_id ?? "";
    try {
        await agent.stream(agentReq, {
            onDelta: (text) => {
                write({ type: "text_delta", text });
            },
            onComplete: (_fullText, provider, fallback, sid) => {
                finalProvider = provider;
                finalFallback = fallback;
                sessionId = sid;
            },
            onError: (error) => {
                write({ type: "error", error });
            },
        });
        write({
            type: "done",
            session_id: sessionId,
            provider_used: finalProvider,
            fallback_active: finalFallback,
        });
    }
    catch (err) {
        write({ type: "error", error: err.message });
    }
    finally {
        res.end();
    }
});
// ─── Non-streaming agent endpoint ─────────────────────────────────────────────
app.post("/agent/complete", async (req, res) => {
    const agentReq = req.body;
    if (!agentReq.mode) {
        res.status(400).json({ error: "mode is required" });
        return;
    }
    let fullText = "";
    let finalProvider = "anthropic";
    let finalFallback = false;
    let sessionId = agentReq.session_id ?? "";
    try {
        await agent.stream(agentReq, {
            onDelta: (text) => {
                fullText += text;
            },
            onComplete: (_text, provider, fallback, sid) => {
                finalProvider = provider;
                finalFallback = fallback;
                sessionId = sid;
            },
            onError: (error) => {
                res.status(500).json({ error });
            },
        });
        res.json({
            session_id: sessionId,
            content: fullText,
            provider_used: finalProvider,
            fallback_active: finalFallback,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({ error: err.message });
});
// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.AGENT_PORT ?? "3001", 10);
app.listen(PORT, "127.0.0.1", () => {
    console.log(`[QuickAI Agent] Listening on http://127.0.0.1:${PORT}`);
    console.log(`[QuickAI Agent] Config: ${config.display_name} (${config.agent_id})`);
    console.log(`[QuickAI Agent] LLM primary: ${config.llm.primary.provider}/${config.llm.primary.model}`);
});
//# sourceMappingURL=index.js.map