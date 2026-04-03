import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";

const AGENT_BASE_URL = "http://localhost:3001";

export interface FilesystemState {
  workspaceRoot: string;
  isAccessible: boolean;
}

export function useFilesystem(initialRoot = "~/Projects") {
  const [state, setState] = useState<FilesystemState>({
    workspaceRoot: initialRoot,
    isAccessible: false,
  });

  const checkAccess = useCallback(async (path: string) => {
    try {
      const response = await fetch(
        `${AGENT_BASE_URL}/filesystem/check?path=${encodeURIComponent(path)}`
      );
      const data = (await response.json()) as { accessible: boolean };
      setState({ workspaceRoot: path, isAccessible: data.accessible });
    } catch {
      setState((prev) => ({ ...prev, isAccessible: false }));
    }
  }, []);

  const setWorkspaceRoot = useCallback(
    async (path: string) => {
      setState((prev) => ({ ...prev, workspaceRoot: path }));
      await checkAccess(path);
    },
    [checkAccess]
  );

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
    checkAccess(initialRoot);
  }, [checkAccess, initialRoot]);

  return {
    ...state,
    setWorkspaceRoot,
    browseForFolder,
    readClipboard,
    writeClipboard,
  };
}
