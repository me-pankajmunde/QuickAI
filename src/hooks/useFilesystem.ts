import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";

const AGENT_BASE_URL = "http://localhost:3001";

export interface FilesystemState {
  workspaceRoot: string;
  isAccessible: boolean;
}

export function useFilesystem(initialRoot = "~") {
  const [state, setState] = useState<FilesystemState>({
    workspaceRoot: initialRoot,
    isAccessible: false,
  });

  const checkAccess = useCallback(async (path: string) => {
    try {
      const response = await fetch(
        `${AGENT_BASE_URL}/filesystem/check?path=${encodeURIComponent(path)}`
      );
      const data = (await response.json()) as {
        accessible: boolean;
        workspace_root?: string;
      };
      setState((prev) => ({
        ...prev,
        workspaceRoot: data.workspace_root ?? path,
        isAccessible: data.accessible,
      }));
    } catch {
      setState((prev) => ({ ...prev, isAccessible: false }));
    }
  }, []);

  const setWorkspaceRoot = useCallback(async (path: string) => {
    try {
      const response = await fetch(`${AGENT_BASE_URL}/filesystem/root`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error("Failed to update workspace root");
      }

      const data = (await response.json()) as {
        accessible: boolean;
        workspace_root: string;
      };

      setState({
        workspaceRoot: data.workspace_root,
        isAccessible: data.accessible,
      });
    } catch {
      setState((prev) => ({ ...prev, workspaceRoot: path, isAccessible: false }));
      await checkAccess(path);
    }
  }, [checkAccess]);

  const browseForFolder = useCallback(async (): Promise<string | null> => {
    try {
      const { open } = await import("@tauri-apps/api/dialog");
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        await setWorkspaceRoot(selected);
        return selected;
      }
      return null;
    } catch {
      return null;
    }
  }, [setWorkspaceRoot]);

  const readClipboard = useCallback(async (): Promise<string> => {
    try {
      return await invoke<string>("read_clipboard");
    } catch {
      return "";
    }
  }, []);

  const writeClipboard = useCallback(async (text: string): Promise<void> => {
    try {
      await invoke<void>("write_clipboard", { text });
    } catch {
      // Fallback to navigator clipboard API
      await navigator.clipboard.writeText(text);
    }
  }, []);

  useEffect(() => {
    void setWorkspaceRoot(initialRoot);
  }, [initialRoot, setWorkspaceRoot]);

  return {
    ...state,
    setWorkspaceRoot,
    browseForFolder,
    readClipboard,
    writeClipboard,
  };
}
