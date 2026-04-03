import { type LLMProvider } from "./llmProvider";
import { SessionManager } from "./sessionManager";
import { FilesystemManager } from "./filesystem";
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
export type AgentRequest = GenerateRequest | ExplainRequest | DebugRequest | RefactorRequest;
export interface StreamCallbacks {
    onDelta: (text: string) => void;
    onComplete: (text: string, provider: LLMProvider, fallback: boolean, sessionId: string) => void;
    onError: (error: string) => void;
}
export declare class CodingAgent {
    private llm;
    private sessions;
    private filesystem;
    private config;
    constructor(config: AgentConfig);
    getSessionManager(): SessionManager;
    getFilesystemManager(): FilesystemManager;
    stream(req: AgentRequest, callbacks: StreamCallbacks): Promise<void>;
}
//# sourceMappingURL=codingAgent.d.ts.map