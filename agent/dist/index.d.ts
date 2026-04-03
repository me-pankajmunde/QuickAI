import type { LLMSettings } from "./llmProvider";
import type { FilesystemConfig } from "./filesystem";
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
//# sourceMappingURL=index.d.ts.map