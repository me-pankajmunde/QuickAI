import React from "react";

interface Props {
  workspaceRoot: string;
  isAccessible: boolean;
  onBrowse: () => void;
}

export const FilesystemIndicator: React.FC<Props> = ({
  workspaceRoot,
  isAccessible,
  onBrowse,
}) => (
  <div
    className={`fs-indicator ${isAccessible ? "fs-indicator--ok" : "fs-indicator--err"}`}
    title={
      isAccessible
        ? `Workspace: ${workspaceRoot}`
        : `Cannot access workspace: ${workspaceRoot}`
    }
  >
    <span className="fs-indicator__icon" aria-hidden="true">
      {isAccessible ? "📁" : "⚠️"}
    </span>
    <button
      className="fs-indicator__path"
      onClick={onBrowse}
      title="Click to change workspace root"
    >
      {workspaceRoot}
    </button>
  </div>
);
