// ─── Agent modes ───────────────────────────────────────────────────────────────
export type AgentMode = "generate" | "explain" | "debug" | "refactor";

export type ExplainGranularity = "summary" | "detailed" | "conceptual";

// ─── LLM providers ────────────────────────────────────────────────────────────
export type LLMProvider = "openai" | "anthropic" | "ollama";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  max_tokens: number;
}

export interface LLMSettings {
  primary: LLMConfig;
  fallback: LLMConfig;
}

// ─── Filesystem config ────────────────────────────────────────────────────────
export interface FilesystemConfig {
  enabled: boolean;
  workspace_root: string;
  deny_list: string[];
  write_requires_confirmation: boolean;
}

// ─── Session ──────────────────────────────────────────────────────────────────
export interface SessionConfig {
  persist_context: boolean;
  max_history_sessions: number;
  auto_clear_after_minutes: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
  workspace_root: string;
  detected_language?: string;
  mode: AgentMode;
}

// ─── Agent config ─────────────────────────────────────────────────────────────
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
  session: SessionConfig;
}

// ─── Agent request / response ─────────────────────────────────────────────────
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

export interface AgentResponse {
  session_id: string;
  content: string;
  language?: string;
  diff?: string;
  provider_used: LLMProvider;
  fallback_active: boolean;
  tokens_used?: number;
  error?: string;
}

// ─── Streaming chunk ──────────────────────────────────────────────────────────
export interface StreamChunk {
  type: "text_delta" | "error" | "done";
  text?: string;
  error?: string;
  session_id?: string;
  provider_used?: LLMProvider;
  fallback_active?: boolean;
}

// ─── UI state ─────────────────────────────────────────────────────────────────
export interface AppState {
  currentMode: AgentMode;
  sessionId?: string;
  workspaceRoot: string;
  detectedLanguage?: string;
  isStreaming: boolean;
  fallbackActive: boolean;
  theme: "light" | "dark";
}
