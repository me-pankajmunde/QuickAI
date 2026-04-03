import Anthropic from "@anthropic-ai/sdk";
import * as https from "https";

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

async function isOllamaAvailable(host = "http://localhost:11434"): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(`${host}/api/tags`);
    const req = https.get(
      { hostname: url.hostname, port: url.port || 11434, path: url.pathname },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function streamOllama(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  maxTokens: number,
  callbacks: StreamCallbacks
): Promise<void> {
  const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const payload = JSON.stringify({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
    options: { num_predict: maxTokens },
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${host}/api/chat`);
    const options = {
      hostname: url.hostname,
      port: parseInt(url.port) || 11434,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let fullText = "";
      res.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
            };
            if (obj.message?.content) {
              fullText += obj.message.content;
              callbacks.onDelta(obj.message.content);
            }
            if (obj.done) {
              callbacks.onComplete(fullText, "ollama", true);
              resolve();
            }
          } catch {
            // Partial JSON; continue.
          }
        }
      });
      res.on("end", () => resolve());
      res.on("error", (err) => reject(err));
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export class LLMProviderService {
  private anthropic: Anthropic;
  private settings: LLMSettings;

  constructor(settings: LLMSettings) {
    this.settings = settings;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async streamCompletion(
    messages: ChatMessage[],
    systemPrompt: string,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const primary = this.settings.primary;

    if (primary.provider === "anthropic") {
      await this.streamAnthropic(messages, systemPrompt, primary, callbacks);
    } else {
      await this.streamWithFallback(messages, systemPrompt, callbacks);
    }
  }

  private async streamAnthropic(
    messages: ChatMessage[],
    systemPrompt: string,
    config: LLMConfig,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fall back to Ollama if no API key configured
      await this.streamWithFallback(messages, systemPrompt, callbacks);
      return;
    }

    try {
      let fullText = "";
      const stream = await this.anthropic.messages.stream({
        model: config.model,
        max_tokens: config.max_tokens,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullText += event.delta.text;
          callbacks.onDelta(event.delta.text);
        }
      }

      callbacks.onComplete(fullText, "anthropic", false);
    } catch (err) {
      const error = err as { status?: number; message?: string };
      // NF-020: Notify when fallback is active (503 or rate limit)
      if (error.status === 503 || error.status === 429 || error.status === 529) {
        console.warn(
          `[LLM] Primary provider returned ${error.status}. Falling back to Ollama.`
        );
        await this.streamWithFallback(messages, systemPrompt, callbacks);
      } else {
        callbacks.onError(error.message ?? String(err));
      }
    }
  }

  private async streamWithFallback(
    messages: ChatMessage[],
    systemPrompt: string,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const fallback = this.settings.fallback;
    const available = await isOllamaAvailable(
      process.env.OLLAMA_HOST ?? "http://localhost:11434"
    );

    if (!available) {
      callbacks.onError(
        "Primary LLM provider unavailable and Ollama fallback is not running. " +
          "Start Ollama or configure ANTHROPIC_API_KEY."
      );
      return;
    }

    await streamOllama(
      fallback.model,
      messages,
      systemPrompt,
      fallback.max_tokens,
      callbacks
    );
  }
}
