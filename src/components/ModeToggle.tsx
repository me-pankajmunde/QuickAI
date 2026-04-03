import React from "react";
import type { AgentMode } from "../types";

interface Props {
  current: AgentMode;
  onChange: (mode: AgentMode) => void;
}

const MODES: { value: AgentMode; label: string; description: string }[] = [
  { value: "generate", label: "Generate", description: "Generate code from natural language" },
  { value: "explain",  label: "Explain",  description: "Explain what code does" },
  { value: "debug",    label: "Debug",    description: "Find bugs and suggest fixes" },
  { value: "refactor", label: "Refactor", description: "Improve code structure" },
];

export const ModeToggle: React.FC<Props> = ({ current, onChange }) => (
  <div className="mode-toggle" role="tablist" aria-label="Agent mode">
    {MODES.map(({ value, label, description }) => (
      <button
        key={value}
        role="tab"
        aria-selected={current === value}
        aria-label={description}
        title={description}
        className={`mode-btn ${current === value ? "mode-btn--active" : ""}`}
        onClick={() => onChange(value)}
      >
        {label}
      </button>
    ))}
  </div>
);
