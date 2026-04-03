import React, { useEffect } from "react";
import { AgentPanel } from "./components/AgentPanel";
import { listen } from "@tauri-apps/api/event";

const App: React.FC = () => {
  useEffect(() => {
    // Listen for global hotkey event from Tauri backend
    let unlisten: (() => void) | undefined;
    listen("open-coding-agent", () => {
      // Panel is always visible; bring focus to main input
      const firstInput = document.querySelector<HTMLElement>(
        "textarea, input[type='text']"
      );
      firstInput?.focus();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  return (
    <div className="app">
      <AgentPanel />
    </div>
  );
};

export default App;
