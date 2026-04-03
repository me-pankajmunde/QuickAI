export type LLMProvider = "anthropic" | "ollama";
export interface LLMConfig {
    provider: LLMProvider;
    model: string;
    max_tokens: number;
}
export interface LLMSettings {
    primary: LLMConfig;
    fallback: LLMConfig;
}
export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}
export interface StreamCallbacks {
    onDelta: (text: string) => void;
    onComplete: (totalText: string, provider: LLMProvider, fallback: boolean) => void;
    onError: (error: string) => void;
}
export declare class LLMProviderService {
    private anthropic;
    private settings;
    constructor(settings: LLMSettings);
    streamCompletion(messages: ChatMessage[], systemPrompt: string, callbacks: StreamCallbacks): Promise<void>;
    private streamAnthropic;
    private streamWithFallback;
}
//# sourceMappingURL=llmProvider.d.ts.map