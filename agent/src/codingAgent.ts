import { createPatch } from "diff";
import { LLMProviderService, type ChatMessage, type LLMProvider } from "./llmProvider";
import { SessionManager } from "./sessionManager";
import { FilesystemManager } from "./filesystem";
import { detectLanguage } from "./languageDetector";
import type { AgentConfig } from "./index";

export type AgentMode = "generate" | "explain" | "debug" | "refactor";
export type ExplainGranularity = "summary" | "detailed" | "conceptual";

export interface GenerateRequest {
  mode: "generate";
  prompt: string;
  language?: string;
  session_id?: string;
}

export interface ExplainRequest {
  mode: "explain";
  code: string;
  granularity: ExplainGranularity;
  language?: string;
  session_id?: string;
}

export interface DebugRequest {
  mode: "debug";
  code: string;
  error_message: string;
  language?: string;
  session_id?: string;
}

export interface RefactorRequest {
  mode: "refactor";
  code: string;
  goal: string;
  language?: string;
  session_id?: string;
}

export type AgentRequest =
  | GenerateRequest
  | ExplainRequest
  | DebugRequest
  | RefactorRequest;

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onComplete: (
    text: string,
    provider: LLMProvider,
    fallback: boolean,
    sessionId: string
  ) => void;
  onError: (error: string) => void;
}

function buildSystemPrompt(config: AgentConfig): string {
  return (
    config.system_prompt +
    `\n\nWorkspace root: ${config.filesystem.workspace_root}\n` +
    `Available tools: ${config.tools.join(", ")}`
  );
}

function buildUserMessage(req: AgentRequest, detectedLang: string): string {
  const lang = req.language ?? detectedLang ?? "unknown";

  switch (req.mode) {
    case "generate":
      return (
        `Generate ${lang !== "unknown" ? lang + " " : ""}code for the following:\n\n` +
        req.prompt +
        "\n\nProvide clean, well-commented, production-quality code. " +
        "Include a brief explanation before the code block."
      );

    case "explain": {
      const depth =
        req.granularity === "summary"
          ? "a concise 2-3 sentence summary"
          : req.granularity === "conceptual"
          ? "a conceptual explanation focusing on design patterns and architecture"
          : "a detailed line-by-line explanation";

      return (
        `Explain the following ${lang} code with ${depth}:\n\n` +
        "```" +
        lang +
        "\n" +
        req.code +
        "\n```"
      );
    }

    case "debug":
      return (
        `Debug the following ${lang} code.\n\n` +
        "Code:\n```" +
        lang +
        "\n" +
        req.code +
        "\n```\n\n" +
        (req.error_message
          ? `Error message:\n\`\`\`\n${req.error_message}\n\`\`\`\n\n`
          : "") +
        "Identify the root cause and provide a corrected version of the code with explanation."
      );

    case "refactor":
      return (
        `Refactor the following ${lang} code.\n\n` +
        "Code:\n```" +
        lang +
        "\n" +
        req.code +
        "\n```\n\n" +
        `Goal: ${req.goal}\n\n` +
        "Provide the refactored code and explain the changes. " +
        "Include a unified diff showing what changed."
      );
  }
}

function generateDiff(original: string, modified: string): string {
  try {
    const patch = createPatch("code", original, modified, "original", "modified");
    return patch;
  } catch {
    return "";
  }
}

export class CodingAgent {
  private llm: LLMProviderService;
  private sessions: SessionManager;
  private filesystem: FilesystemManager;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.llm = new LLMProviderService(config.llm);
    this.sessions = new SessionManager();
    this.filesystem = new FilesystemManager(config.filesystem);
  }

  getSessionManager(): SessionManager {
    return this.sessions;
  }

  getFilesystemManager(): FilesystemManager {
    return this.filesystem;
  }

  async stream(req: AgentRequest, callbacks: StreamCallbacks): Promise<void> {
    // Detect language if not provided
    const codeSnippet =
      req.mode === "explain" || req.mode === "debug" || req.mode === "refactor"
        ? req.code
        : "";
    const detected = detectLanguage(codeSnippet).language;
    const lang = req.language ?? detected;

    // Build or retrieve session
    const sessionId = req.session_id ?? `session_${Date.now()}`;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        name: `Session ${new Date().toLocaleTimeString()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
        workspace_root: this.config.filesystem.workspace_root,
        detected_language: lang,
        mode: req.mode,
      };
    }

    const userMsg = buildUserMessage(req, lang);

    // Append user message to history (CA-070: maintain conversation context)
    const history: ChatMessage[] = [
      ...session.messages,
      { role: "user", content: userMsg },
    ];

    const systemPrompt = buildSystemPrompt(this.config);
    const originalCode =
      req.mode === "refactor" || req.mode === "debug" ? req.code : undefined;

    await this.llm.streamCompletion(history, systemPrompt, {
      onDelta: (text) => callbacks.onDelta(text),
      onComplete: (fullText, provider, fallback) => {
        // Add messages to session
        this.sessions.addMessage(sessionId, { role: "user", content: userMsg });
        this.sessions.addMessage(sessionId, {
          role: "assistant",
          content: fullText,
        });

        // Generate diff for refactor mode
        if (req.mode === "refactor" && originalCode) {
          const codeMatch = fullText.match(/```[\w]*\n([\s\S]*?)```/);
          const modifiedCode = codeMatch ? codeMatch[1] : fullText;
          const diff = generateDiff(originalCode, modifiedCode);
          if (diff && !fullText.includes("```diff")) {
            callbacks.onDelta("\n\n```diff\n" + diff + "\n```");
          }
        }

        callbacks.onComplete(fullText, provider, fallback, sessionId);
      },
      onError: callbacks.onError,
    });
  }
}
