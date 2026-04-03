"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodingAgent = void 0;
const diff_1 = require("diff");
const llmProvider_1 = require("./llmProvider");
const sessionManager_1 = require("./sessionManager");
const filesystem_1 = require("./filesystem");
const languageDetector_1 = require("./languageDetector");
function buildSystemPrompt(config) {
    return (config.system_prompt +
        `\n\nWorkspace root: ${config.filesystem.workspace_root}\n` +
        `Available tools: ${config.tools.join(", ")}`);
}
function buildUserMessage(req, detectedLang) {
    const lang = req.language ?? detectedLang ?? "unknown";
    switch (req.mode) {
        case "generate":
            return (`Generate ${lang !== "unknown" ? lang + " " : ""}code for the following:\n\n` +
                req.prompt +
                "\n\nProvide clean, well-commented, production-quality code. " +
                "Include a brief explanation before the code block.");
        case "explain": {
            const depth = req.granularity === "summary"
                ? "a concise 2-3 sentence summary"
                : req.granularity === "conceptual"
                    ? "a conceptual explanation focusing on design patterns and architecture"
                    : "a detailed line-by-line explanation";
            return (`Explain the following ${lang} code with ${depth}:\n\n` +
                "```" +
                lang +
                "\n" +
                req.code +
                "\n```");
        }
        case "debug":
            return (`Debug the following ${lang} code.\n\n` +
                "Code:\n```" +
                lang +
                "\n" +
                req.code +
                "\n```\n\n" +
                (req.error_message
                    ? `Error message:\n\`\`\`\n${req.error_message}\n\`\`\`\n\n`
                    : "") +
                "Identify the root cause and provide a corrected version of the code with explanation.");
        case "refactor":
            return (`Refactor the following ${lang} code.\n\n` +
                "Code:\n```" +
                lang +
                "\n" +
                req.code +
                "\n```\n\n" +
                `Goal: ${req.goal}\n\n` +
                "Provide the refactored code and explain the changes. " +
                "Include a unified diff showing what changed.");
    }
}
function generateDiff(original, modified) {
    try {
        const patch = (0, diff_1.createPatch)("code", original, modified, "original", "modified");
        return patch;
    }
    catch {
        return "";
    }
}
class CodingAgent {
    constructor(config) {
        this.config = config;
        this.llm = new llmProvider_1.LLMProviderService(config.llm);
        this.sessions = new sessionManager_1.SessionManager();
        this.filesystem = new filesystem_1.FilesystemManager(config.filesystem);
    }
    getSessionManager() {
        return this.sessions;
    }
    getFilesystemManager() {
        return this.filesystem;
    }
    async stream(req, callbacks) {
        // Detect language if not provided
        const codeSnippet = req.mode === "explain" || req.mode === "debug" || req.mode === "refactor"
            ? req.code
            : "";
        const detected = (0, languageDetector_1.detectLanguage)(codeSnippet).language;
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
        const history = [
            ...session.messages,
            { role: "user", content: userMsg },
        ];
        const systemPrompt = buildSystemPrompt(this.config);
        const originalCode = req.mode === "refactor" || req.mode === "debug" ? req.code : undefined;
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
exports.CodingAgent = CodingAgent;
//# sourceMappingURL=codingAgent.js.map