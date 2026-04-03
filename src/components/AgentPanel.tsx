import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  KeyboardEvent,
} from "react";
import { ModeToggle } from "./ModeToggle";
import { CodeOutput } from "./CodeOutput";
import { OutputActions } from "./OutputActions";
import { FilesystemIndicator } from "./FilesystemIndicator";
import { useSession } from "../hooks/useSession";
import { useFilesystem } from "../hooks/useFilesystem";
import type {
  AgentMode,
  ExplainGranularity,
  AgentRequest,
  StreamChunk,
  LLMProvider,
} from "../types";

const AGENT_BASE_URL = "http://localhost:3001";

export const AgentPanel: React.FC = () => {
  const [mode, setMode] = useState<AgentMode>("generate");
  const [prompt, setPrompt] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [errorInput, setErrorInput] = useState("");
  const [granularity, setGranularity] = useState<ExplainGranularity>("detailed");
  const [output, setOutput] = useState("");
  const [diffOutput, setDiffOutput] = useState("");
  const [detectedLang, setDetectedLang] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [fallbackActive, setFallbackActive] = useState(false);
  const [providerUsed, setProviderUsed] = useState<LLMProvider>("openai");
  const [statusMsg, setStatusMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const { currentSession, createSession, addMessage, ensureSession } =
    useSession();
  const { workspaceRoot, isAccessible, browseForFolder, writeClipboard } =
    useFilesystem();

  // Auto-detect language when code changes
  useEffect(() => {
    if (codeInput.trim()) {
      detectLanguage(codeInput).then((lang) => {
        if (lang) setDetectedLang(lang);
      });
    }
  }, [codeInput]);

  const handleModeChange = useCallback((m: AgentMode) => {
    setMode(m);
    setOutput("");
    setDiffOutput("");
    setStatusMsg("");
  }, []);

  const buildRequest = useCallback((): AgentRequest | null => {
    const session = ensureSession(mode, workspaceRoot);
    const session_id = session.id;

    switch (mode) {
      case "generate":
        if (!prompt.trim()) {
          setStatusMsg("Please enter a prompt.");
          return null;
        }
        return { mode, prompt: prompt.trim(), language: detectedLang, session_id };

      case "explain":
        if (!codeInput.trim()) {
          setStatusMsg("Please paste code to explain.");
          return null;
        }
        return {
          mode,
          code: codeInput.trim(),
          granularity,
          language: detectedLang,
          session_id,
        };

      case "debug":
        if (!codeInput.trim()) {
          setStatusMsg("Please paste code to debug.");
          return null;
        }
        return {
          mode,
          code: codeInput.trim(),
          error_message: errorInput.trim(),
          language: detectedLang,
          session_id,
        };

      case "refactor":
        if (!codeInput.trim()) {
          setStatusMsg("Please paste code to refactor.");
          return null;
        }
        return {
          mode,
          code: codeInput.trim(),
          goal: prompt.trim() || "Improve readability and performance",
          language: detectedLang,
          session_id,
        };
    }
  }, [mode, prompt, codeInput, errorInput, granularity, detectedLang, workspaceRoot, ensureSession]);

  const handleSubmit = useCallback(async () => {
    const req = buildRequest();
    if (!req) return;

    setIsStreaming(true);
    setOutput("");
    setDiffOutput("");
    setStatusMsg("Thinking…");
    setFallbackActive(false);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${AGENT_BASE_URL}/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        setStatusMsg(`Error: ${response.status} – ${errorText}`);
        setIsStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setStatusMsg("No response stream available.");
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const rawChunk = decoder.decode(value, { stream: true });
        const lines = rawChunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const chunk = JSON.parse(line.slice(6)) as StreamChunk;

            if (chunk.type === "text_delta" && chunk.text) {
              fullText += chunk.text;
              setOutput(fullText);
            } else if (chunk.type === "done") {
              if (chunk.provider_used) setProviderUsed(chunk.provider_used);
              if (chunk.fallback_active) setFallbackActive(true);
              setStatusMsg("");

              // Record assistant message in session
              addMessage({
                role: "assistant",
                content: fullText,
                timestamp: new Date().toISOString(),
              });
            } else if (chunk.type === "error") {
              setStatusMsg(`Agent error: ${chunk.error ?? "unknown"}`);
            }
          } catch {
            // Malformed chunk; skip.
          }
        }
      }

      // Extract diff section if present
      const diffMatch = fullText.match(/```diff\n([\s\S]*?)```/);
      if (diffMatch) setDiffOutput(diffMatch[1]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setStatusMsg(`Network error: ${(err as Error).message}`);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [buildRequest, addMessage]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStatusMsg("Stopped.");
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleNewSession = useCallback(() => {
    createSession(mode, workspaceRoot);
    setOutput("");
    setDiffOutput("");
    setPrompt("");
    setCodeInput("");
    setErrorInput("");
    setStatusMsg("New session started.");
  }, [createSession, mode, workspaceRoot]);

  const needsCodeInput = mode !== "generate";
  const showGranularity = mode === "explain";
  const showErrorInput = mode === "debug";
  const showGoalInput = mode === "refactor";
  const showDiff = mode === "refactor" && !!diffOutput;

  return (
    <div className="agent-panel">
      {/* Header */}
      <header className="agent-panel__header">
        <div className="agent-panel__title">
          <span className="agent-panel__icon">⚡</span>
          <h1>QuickAI Coding Agent</h1>
        </div>
        <div className="agent-panel__header-actions">
          <FilesystemIndicator
            workspaceRoot={workspaceRoot}
            isAccessible={isAccessible}
            onBrowse={browseForFolder}
          />
          <button
            className="btn btn--secondary"
            onClick={handleNewSession}
            title="Start a new session"
          >
            New Session
          </button>
        </div>
      </header>

      {/* Mode toggle */}
      <ModeToggle current={mode} onChange={handleModeChange} />

      {/* Fallback notification */}
      {fallbackActive && (
        <div className="alert alert--warning" role="alert">
          ⚠️ Using fallback model ({providerUsed}). Primary provider unavailable.
        </div>
      )}

      {/* Session info */}
      {currentSession && (
        <div className="session-badge">
          Session: {currentSession.name} · {currentSession.messages.length} message
          {currentSession.messages.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Input area */}
      <div className="agent-panel__inputs">
        {/* Prompt / goal for generate + refactor */}
        {(mode === "generate" || showGoalInput) && (
          <div className="form-group">
            <label className="form-label" htmlFor="prompt">
              {mode === "generate" ? "Describe what you want to build" : "Refactoring goal"}
            </label>
            <textarea
              id="prompt"
              className="form-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "generate"
                  ? "e.g. Write a React hook that fetches paginated data…"
                  : "e.g. Improve readability and reduce complexity…"
              }
              rows={3}
              disabled={isStreaming}
            />
          </div>
        )}

        {/* Code input */}
        {needsCodeInput && (
          <div className="form-group">
            <label className="form-label" htmlFor="code-input">
              Paste your code
              {detectedLang && (
                <span className="form-label__badge"> · {detectedLang}</span>
              )}
            </label>
            <textarea
              id="code-input"
              className="form-textarea form-textarea--code"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste your code here…"
              rows={12}
              disabled={isStreaming}
              spellCheck={false}
            />
          </div>
        )}

        {/* Error message for debug mode */}
        {showErrorInput && (
          <div className="form-group">
            <label className="form-label" htmlFor="error-input">
              Error message (optional)
            </label>
            <textarea
              id="error-input"
              className="form-textarea"
              value={errorInput}
              onChange={(e) => setErrorInput(e.target.value)}
              placeholder="Paste the error or stack trace here…"
              rows={4}
              disabled={isStreaming}
              spellCheck={false}
            />
          </div>
        )}

        {/* Granularity selector for explain mode */}
        {showGranularity && (
          <div className="form-group form-group--inline">
            <label className="form-label">Explanation depth</label>
            <div className="radio-group">
              {(["summary", "detailed", "conceptual"] as ExplainGranularity[]).map(
                (g) => (
                  <label key={g} className="radio-label">
                    <input
                      type="radio"
                      name="granularity"
                      value={g}
                      checked={granularity === g}
                      onChange={() => setGranularity(g)}
                      disabled={isStreaming}
                    />
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </label>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="agent-panel__submit">
        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={isStreaming}
          title="Run agent (Ctrl+Enter)"
        >
          {isStreaming ? "Running…" : "Run"}
        </button>
        {isStreaming && (
          <button className="btn btn--danger" onClick={handleStop}>
            Stop
          </button>
        )}
        {statusMsg && (
          <span className="status-msg" role="status">
            {statusMsg}
          </span>
        )}
      </div>

      {/* Output area */}
      {output && (
        <div className="agent-panel__output">
          <div className="agent-panel__output-header">
            <h2>Output</h2>
            <OutputActions
              content={output}
              language={detectedLang}
              onCopy={writeClipboard}
              disabled={isStreaming}
            />
          </div>
          <CodeOutput
            code={output}
            language={detectedLang}
            showLineNumbers={true}
            isDiff={false}
          />
          {showDiff && (
            <>
              <h3 className="diff-heading">Diff</h3>
              <CodeOutput
                code={diffOutput}
                language="diff"
                showLineNumbers={false}
                isDiff={true}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

async function detectLanguage(code: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${AGENT_BASE_URL}/language/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (response.ok) {
      const data = (await response.json()) as { language: string };
      return data.language;
    }
  } catch {
    // Sidecar not available.
  }
  return undefined;
}
