import { ChatAnthropic } from "@langchain/anthropic";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  BaseMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";

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

/** Build a LangChain ChatOpenAI model instance. */
function buildOpenAIModel(config: LLMConfig): ChatOpenAI {
  const baseURL = process.env.OPENAI_BASE_URL;

  return new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "not-needed",
    model: config.model,
    maxTokens: config.max_tokens,
    streaming: true,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
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

function buildModel(config: LLMConfig): BaseChatModel {
  switch (config.provider) {
    case "openai":
      return buildOpenAIModel(config);
    case "anthropic":
      return buildAnthropicModel(config);
    case "ollama":
      return buildOllamaModel(config);
  }
}

/** Probe whether the Ollama server is reachable. */
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

async function checkProviderAvailability(
  config: LLMConfig
): Promise<{ available: boolean; reason?: string }> {
  switch (config.provider) {
    case "openai":
      if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) {
        return { available: true };
      }
      return {
        available: false,
        reason: "OPENAI_API_KEY or OPENAI_BASE_URL is not set.",
      };

    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        return { available: true };
      }
      return {
        available: false,
        reason: "ANTHROPIC_API_KEY is not set.",
      };

    case "ollama": {
      const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
      const available = await isOllamaAvailable(host);
      return available
        ? { available: true }
        : {
            available: false,
            reason: `Ollama is not reachable at ${host}.`,
          };
    }
  }
}

function shouldFallback(error: { status?: number }): boolean {
  return (
    error.status === 429 ||
    error.status === 503 ||
    error.status === 529
  );
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
    const primaryStatus = await checkProviderAvailability(primary);

    if (!primaryStatus.available) {
      console.warn(
        `[LLM] ${primaryStatus.reason ?? "Primary provider unavailable."} Falling back to ${this.settings.fallback.provider}.`
      );
      await this.streamFallback(messages, systemPrompt, callbacks);
      return;
    }

    await this.streamWithConfig(messages, systemPrompt, primary, callbacks, false);
  }

  private async streamWithConfig(
    messages: ChatMessage[],
    systemPrompt: string,
    config: LLMConfig,
    callbacks: StreamCallbacks,
    fallback: boolean
  ): Promise<void> {
    const availability = await checkProviderAvailability(config);
    if (!availability.available) {
      if (!fallback) {
        console.warn(
          `[LLM] ${availability.reason ?? "Primary provider unavailable."} Falling back to ${this.settings.fallback.provider}.`
        );
        await this.streamFallback(messages, systemPrompt, callbacks);
        return;
      }

      callbacks.onError(
        `${availability.reason ?? "Fallback provider unavailable."} ` +
          "Configure OPENAI_API_KEY / OPENAI_BASE_URL, ANTHROPIC_API_KEY, or start Ollama."
      );
      return;
    }

    const lcMessages = toLangChainMessages(messages, systemPrompt);
    const model = buildModel(config);

    try {
      await streamModel(model, lcMessages, config.provider, fallback, callbacks);
    } catch (err) {
      const error = err as { status?: number; message?: string };

      if (!fallback && shouldFallback(error)) {
        console.warn(
          `[LLM] ${config.provider} returned ${error.status}. Falling back to ${this.settings.fallback.provider}.`
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
    await this.streamWithConfig(messages, systemPrompt, fallbackConfig, callbacks, true);
  }
}
