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
exports.LLMProviderService = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const https = __importStar(require("https"));
async function isOllamaAvailable(host = "http://localhost:11434") {
    return new Promise((resolve) => {
        const url = new URL(`${host}/api/tags`);
        const req = https.get({ hostname: url.hostname, port: url.port || 11434, path: url.pathname }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}
async function streamOllama(model, messages, systemPrompt, maxTokens, callbacks) {
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
            res.on("data", (chunk) => {
                const lines = chunk.toString().split("\n").filter(Boolean);
                for (const line of lines) {
                    try {
                        const obj = JSON.parse(line);
                        if (obj.message?.content) {
                            fullText += obj.message.content;
                            callbacks.onDelta(obj.message.content);
                        }
                        if (obj.done) {
                            callbacks.onComplete(fullText, "ollama", true);
                            resolve();
                        }
                    }
                    catch {
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
class LLMProviderService {
    constructor(settings) {
        this.settings = settings;
        this.anthropic = new sdk_1.default({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    async streamCompletion(messages, systemPrompt, callbacks) {
        const primary = this.settings.primary;
        if (primary.provider === "anthropic") {
            await this.streamAnthropic(messages, systemPrompt, primary, callbacks);
        }
        else {
            await this.streamWithFallback(messages, systemPrompt, callbacks);
        }
    }
    async streamAnthropic(messages, systemPrompt, config, callbacks) {
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
                if (event.type === "content_block_delta" &&
                    event.delta.type === "text_delta") {
                    fullText += event.delta.text;
                    callbacks.onDelta(event.delta.text);
                }
            }
            callbacks.onComplete(fullText, "anthropic", false);
        }
        catch (err) {
            const error = err;
            // NF-020: Notify when fallback is active (503 or rate limit)
            if (error.status === 503 || error.status === 429 || error.status === 529) {
                console.warn(`[LLM] Primary provider returned ${error.status}. Falling back to Ollama.`);
                await this.streamWithFallback(messages, systemPrompt, callbacks);
            }
            else {
                callbacks.onError(error.message ?? String(err));
            }
        }
    }
    async streamWithFallback(messages, systemPrompt, callbacks) {
        const fallback = this.settings.fallback;
        const available = await isOllamaAvailable(process.env.OLLAMA_HOST ?? "http://localhost:11434");
        if (!available) {
            callbacks.onError("Primary LLM provider unavailable and Ollama fallback is not running. " +
                "Start Ollama or configure ANTHROPIC_API_KEY.");
            return;
        }
        await streamOllama(fallback.model, messages, systemPrompt, fallback.max_tokens, callbacks);
    }
}
exports.LLMProviderService = LLMProviderService;
//# sourceMappingURL=llmProvider.js.map