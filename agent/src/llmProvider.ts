import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  BaseMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

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

/** Convert our role-based history + system prompt into LangChain BaseMessages. */
function toLangChainMessages(
  messages: ChatMessage[],
  systemPrompt: string
): BaseMessage[] {
  const result: BaseMessage[] = [new SystemMessage(systemPrompt)];
  for (const msg of messages) {
    result.push(
      msg.role === "user"
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content)
    );
  }
  return result;
}

/** Build a LangChain ChatAnthropic model instance. */
function buildAnthropicModel(config: LLMConfig): ChatAnthropic {
  return new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: config.model,
    maxTokens: config.max_tokens,
    streaming: true,
  });
}

/** Build a LangChain ChatOllama model instance. */
function buildOllamaModel(config: LLMConfig): ChatOllama {
  return new ChatOllama({
    baseUrl: process.env.OLLAMA_HOST ?? "http://localhost:11434",
    model: config.model,
    numPredict: config.max_tokens,
  });
}

/** Probe whether the Ollama server is reachable (NF-020). */
async function isOllamaAvailable(
  host = "http://localhost:11434"
): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${host}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stream tokens from a LangChain chat model and call the provided callbacks.
 * Returns when the stream is fully consumed.
 */
async function streamModel(
  model: BaseChatModel,
  lcMessages: BaseMessage[],
  provider: LLMProvider,
  fallback: boolean,
  callbacks: StreamCallbacks
): Promise<void> {
  let fullText = "";
  const stream = await model.stream(lcMessages);
  for await (const chunk of stream) {
    const text =
      typeof chunk.content === "string"
        ? chunk.content
        : (chunk.content as Array<{ text?: string }>)
            .map((c) => c.text ?? "")
            .join("");
    if (text) {
      fullText += text;
      callbacks.onDelta(text);
    }
  }
  callbacks.onComplete(fullText, provider, fallback);
}

export class LLMProviderService {
  private settings: LLMSettings;

  constructor(settings: LLMSettings) {
    this.settings = settings;
  }

  async streamCompletion(
    messages: ChatMessage[],
    systemPrompt: string,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const primary = this.settings.primary;

    if (primary.provider === "anthropic") {
      if (!process.env.ANTHROPIC_API_KEY) {
        // No API key — skip directly to Ollama fallback (NF-020)
        console.warn("[LLM] ANTHROPIC_API_KEY not set. Falling back to Ollama.");
        await this.streamFallback(messages, systemPrompt, callbacks);
        return;
      }
      await this.streamPrimary(messages, systemPrompt, primary, callbacks);
    } else {
      // Primary is Ollama
      await this.streamFallback(messages, systemPrompt, callbacks);
    }
  }

  private async streamPrimary(
    messages: ChatMessage[],
    systemPrompt: string,
    config: LLMConfig,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const lcMessages = toLangChainMessages(messages, systemPrompt);
    const model = buildAnthropicModel(config);

    try {
      await streamModel(model, lcMessages, "anthropic", false, callbacks);
    } catch (err) {
      const error = err as { status?: number; message?: string };
      // NF-020: fall back on service-unavailable / rate-limit responses
      if (
        error.status === 503 ||
        error.status === 429 ||
        error.status === 529
      ) {
        console.warn(
          `[LLM] Primary provider returned ${error.status}. Falling back to Ollama.`
        );
        await this.streamFallback(messages, systemPrompt, callbacks);
      } else {
        callbacks.onError(error.message ?? String(err));
      }
    }
  }

  private async streamFallback(
    messages: ChatMessage[],
    systemPrompt: string,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const fallbackConfig = this.settings.fallback;
    const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";

    const available = await isOllamaAvailable(host);
    if (!available) {
      callbacks.onError(
        "Primary LLM provider unavailable and Ollama fallback is not running. " +
          "Start Ollama or configure ANTHROPIC_API_KEY."
      );
      return;
    }

    const lcMessages = toLangChainMessages(messages, systemPrompt);
    const model = buildOllamaModel(fallbackConfig);

    try {
      await streamModel(model, lcMessages, "ollama", true, callbacks);
    } catch (err) {
      callbacks.onError((err as Error).message ?? String(err));
    }
  }
}
