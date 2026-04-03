import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import { CodingAgent, type AgentRequest } from "./codingAgent";
import { detectLanguage } from "./languageDetector";
import type { Session } from "./sessionManager";
import type { LLMSettings, LLMProvider } from "./llmProvider";
import { getDefaultWorkspaceRoot, getHomeDir, type FilesystemConfig } from "./filesystem";

// ─── Config types ─────────────────────────────────────────────────────────────
export interface AgentConfig {
  agent_id: string;
  display_name: string;
  icon: string;
  hotkey: string;
  system_prompt: string;
  tools: string[];
  filesystem: FilesystemConfig;
  mcp_servers: string[];
  llm: LLMSettings;
  output_defaults: {
    syntax_highlighting: boolean;
    line_numbers: boolean;
    diff_view: boolean;
  };
  session: {
    persist_context: boolean;
    max_history_sessions: number;
    auto_clear_after_minutes: number;
  };
}

// ─── Default config ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG: AgentConfig = {
  agent_id: "coder",
  display_name: "Coding Agent",
  icon: "code-bracket",
  hotkey: "CmdOrCtrl+Shift+C",
  system_prompt:
    "You are a senior software engineer assistant. You write clean, " +
    "well-documented, production-quality code. You explain concepts clearly " +
    "and provide actionable debugging advice. Always follow best practices " +
    "for the language/framework being used.",
  tools: ["Bash", "Read", "Edit"],
  filesystem: {
    enabled: true,
    workspace_root: getDefaultWorkspaceRoot(),
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
      provider: "openai",
      model: "gpt-4o-mini",
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
function normalizeConfig(partial: Partial<AgentConfig>): AgentConfig {
  const merged: AgentConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
    filesystem: {
      ...DEFAULT_CONFIG.filesystem,
      ...(partial.filesystem ?? {}),
    },
    llm: {
      primary: {
        ...DEFAULT_CONFIG.llm.primary,
        ...(partial.llm?.primary ?? {}),
      },
      fallback: {
        ...DEFAULT_CONFIG.llm.fallback,
        ...(partial.llm?.fallback ?? {}),
      },
    },
    output_defaults: {
      ...DEFAULT_CONFIG.output_defaults,
      ...(partial.output_defaults ?? {}),
    },
    session: {
      ...DEFAULT_CONFIG.session,
      ...(partial.session ?? {}),
    },
  };

  if (!fs.existsSync(merged.filesystem.workspace_root)) {
    merged.filesystem.workspace_root = getDefaultWorkspaceRoot();
  }

  return merged;
}

function loadConfig(): AgentConfig {
  const configDir = path.join(getHomeDir(), "QuickAI", "agents");
  const configFile = path.join(configDir, "coder.json");

  try {
    if (fs.existsSync(configFile)) {
      const raw = fs.readFileSync(configFile, "utf-8");
      return normalizeConfig(JSON.parse(raw) as Partial<AgentConfig>);
    }
  } catch {
    console.warn("[config] Failed to load coder.json; using defaults.");
  }

  // Write default config for first-time users
  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
  } catch {
    // Non-critical.
  }

  return normalizeConfig(DEFAULT_CONFIG);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const config = loadConfig();
const agent = new CodingAgent(config);

const app = express();
app.use(cors({ origin: ["http://localhost:1420", "tauri://localhost"] }));
app.use(express.json({ limit: "2mb" }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: "0.1.0" });
});

// ─── Language detection ───────────────────────────────────────────────────────
app.post("/language/detect", (req: Request, res: Response) => {
  const { code, filename } = req.body as { code?: string; filename?: string };
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }
  const result = detectLanguage(code, filename);
  res.json(result);
});

// ─── Filesystem check ─────────────────────────────────────────────────────────
app.get("/filesystem/check", (req: Request, res: Response) => {
  const { path: checkPath } = req.query as { path?: string };
  if (!checkPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  const fs_manager = agent.getFilesystemManager();
  const accessible = fs_manager.checkAccess(checkPath);
  res.json({ accessible, workspace_root: fs_manager.getWorkspaceRoot() });
});

app.post("/filesystem/root", (req: Request, res: Response) => {
  const { path: rootPath } = req.body as { path?: string };
  if (!rootPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  try {
    const fs_manager = agent.getFilesystemManager();
    const workspace_root = fs_manager.setWorkspaceRoot(rootPath);
    res.json({ accessible: true, workspace_root });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
app.get("/sessions", (_req: Request, res: Response) => {
  const sessions = agent.getSessionManager().getAll();
  res.json(sessions);
});

app.post("/sessions", (req: Request, res: Response) => {
  const sessions = req.body as Session[];
  if (!Array.isArray(sessions)) {
    res.status(400).json({ error: "body must be an array of sessions" });
    return;
  }
  agent.getSessionManager().saveAll(sessions);
  res.json({ saved: sessions.length });
});

// ─── Streaming agent endpoint ─────────────────────────────────────────────────
app.post("/agent/stream", async (req: Request, res: Response) => {
  const agentReq = req.body as AgentRequest;

  if (!agentReq.mode) {
    res.status(400).json({ error: "mode is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let finalProvider: LLMProvider = config.llm.primary.provider;
  let finalFallback = false;
  let sessionId = agentReq.session_id ?? "";

  try {
    await agent.stream(agentReq, {
      onDelta: (text) => {
        write({ type: "text_delta", text });
      },
      onComplete: (
        _fullText,
        provider: LLMProvider,
        fallback: boolean,
        sid: string
      ) => {
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
  } catch (err) {
    write({ type: "error", error: (err as Error).message });
  } finally {
    res.end();
  }
});

// ─── Non-streaming agent endpoint ─────────────────────────────────────────────
app.post("/agent/complete", async (req: Request, res: Response) => {
  const agentReq = req.body as AgentRequest;

  if (!agentReq.mode) {
    res.status(400).json({ error: "mode is required" });
    return;
  }

  let fullText = "";
  let finalProvider: LLMProvider = config.llm.primary.provider;
  let finalFallback = false;
  let sessionId = agentReq.session_id ?? "";

  try {
    await agent.stream(agentReq, {
      onDelta: (text) => {
        fullText += text;
      },
      onComplete: (
        _text,
        provider: LLMProvider,
        fallback: boolean,
        sid: string
      ) => {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
