import React, { useCallback } from "react";
import { save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";

interface Props {
  content: string;
  language?: string;
  onCopy: (text: string) => Promise<void>;
  disabled?: boolean;
}

export const OutputActions: React.FC<Props> = ({
  content,
  language,
  onCopy,
  disabled = false,
}) => {
  const handleCopy = useCallback(async () => {
    await onCopy(content);
  }, [content, onCopy]);

  const handleSave = useCallback(async () => {
    if (!content) return;
    const ext = language ? extensionFor(language) : "txt";
    try {
      const filePath = await save({
        defaultPath: `output.${ext}`,
        filters: [{ name: "Code file", extensions: [ext] }],
      });
      if (filePath) {
        await writeTextFile(filePath, content);
      }
    } catch {
      // User cancelled or Tauri unavailable – silent.
    }
  }, [content, language]);

  const handlePasteBack = useCallback(async () => {
    await onCopy(content);
    // Emit event for any registered paste-back handler (e.g., editor integration)
    window.dispatchEvent(new CustomEvent("quickai:paste-back", { detail: content }));
  }, [content, onCopy]);

  return (
    <div className="output-actions" role="toolbar" aria-label="Output actions">
      <button
        className="output-actions__btn"
        onClick={handleCopy}
        disabled={disabled || !content}
        title="Copy to clipboard (Ctrl+Shift+Y)"
        aria-label="Copy output"
      >
        Copy
      </button>
      <button
        className="output-actions__btn"
        onClick={handlePasteBack}
        disabled={disabled || !content}
        title="Paste back to editor (Ctrl+Shift+V)"
        aria-label="Paste back to editor"
      >
        Paste Back
      </button>
      <button
        className="output-actions__btn"
        onClick={handleSave}
        disabled={disabled || !content}
        title="Save to file (Ctrl+Shift+S)"
        aria-label="Save output to file"
      >
        Save
      </button>
    </div>
  );
};

function extensionFor(lang: string): string {
  const map: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    rust: "rs",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    html: "html",
    css: "css",
    json: "json",
    markdown: "md",
    bash: "sh",
    shell: "sh",
    sql: "sql",
    ruby: "rb",
    php: "php",
    swift: "swift",
    kotlin: "kt",
  };
  return map[lang.toLowerCase()] ?? "txt";
}
