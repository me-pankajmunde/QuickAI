import * as path from "path";
import * as fs from "fs";

export interface FilesystemConfig {
  enabled: boolean;
  workspace_root: string;
  deny_list: string[];
  write_requires_confirmation: boolean;
}

const DEFAULT_DENY_LIST = [
  "~/.ssh",
  "~/.aws",
  "~/.gnupg",
  "~/.config/credentials",
  "/etc",
  "/proc",
  "/sys",
  "C:\\Windows\\System32",
  "C:\\Users\\*\\AppData\\Roaming\\Microsoft\\Credentials",
];

const LOG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? ".",
  "QuickAI",
  "logs"
);

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
    return p === "~" ? home : path.join(home, p.slice(2));
  }
  return p;
}

function resolveWorkspaceRoot(root: string): string {
  return path.resolve(expandHome(root));
}

function isInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(expandHome(filePath));
  const workspace = resolveWorkspaceRoot(workspaceRoot);
  const relative = path.relative(workspace, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isDenied(filePath: string, denyList: string[]): boolean {
  const resolved = path.resolve(expandHome(filePath));
  return denyList.some((denied) => {
    const resolvedDenied = expandHome(denied);
    if (resolvedDenied.includes("*")) {
      // Simple wildcard – check prefix
      const prefix = resolvedDenied.replace(/\*.*$/, "");
      return resolved.startsWith(path.resolve(prefix));
    }
    return (
      resolved === path.resolve(resolvedDenied) ||
      resolved.startsWith(path.resolve(resolvedDenied) + path.sep)
    );
  });
}

async function logOperation(
  operation: string,
  filePath: string,
  extra?: string
): Promise<void> {
  const entry = `[${new Date().toISOString()}] ${operation} ${filePath}${extra ? " " + extra : ""}\n`;
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
    await fs.promises.appendFile(path.join(LOG_DIR, "filesystem.log"), entry);
  } catch {
    // Non-critical; don't block on log failure.
  }
}

export class FilesystemManager {
  private config: FilesystemConfig;
  private denyList: string[];

  constructor(config: FilesystemConfig) {
    this.config = config;
    this.denyList = [...DEFAULT_DENY_LIST, ...(config.deny_list ?? [])];
  }

  private guard(filePath: string, mode: "read" | "write"): void {
    if (!this.config.enabled) {
      throw new Error("Filesystem access is disabled.");
    }

    // CA-051: NEVER access paths outside workspace_root
    if (!isInsideWorkspace(filePath, this.config.workspace_root)) {
      throw new Error(
        `Access denied (CA-051): ${filePath} is outside workspace root ${this.config.workspace_root}`
      );
    }

    // CA-052: Deny-list check
    if (isDenied(filePath, this.denyList)) {
      throw new Error(`Access denied (CA-052): ${filePath} is in the deny-list`);
    }

    // Write-requires-confirmation (enforced by caller; flag checked here for logging)
    if (mode === "write" && this.config.write_requires_confirmation) {
      // In a desktop context, this would prompt the user. Sidecar trusts caller.
    }
  }

  async readFile(filePath: string): Promise<string> {
    this.guard(filePath, "read");
    const resolved = path.resolve(expandHome(filePath));
    await logOperation("READ", resolved);
    return fs.promises.readFile(resolved, "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.guard(filePath, "write");
    const resolved = path.resolve(expandHome(filePath));

    // NF-022: Create .bak backup before write
    if (
      fs.existsSync(resolved) &&
      fs.statSync(resolved).size < 10 * 1024 * 1024
    ) {
      const bakPath = `${resolved}.bak`;
      await fs.promises.copyFile(resolved, bakPath);
      await logOperation("BACKUP", resolved, `→ ${bakPath}`);
    }

    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, "utf-8");
    await logOperation("WRITE", resolved);
  }

  async listDir(dirPath: string): Promise<string[]> {
    this.guard(dirPath, "read");
    const resolved = path.resolve(expandHome(dirPath));
    await logOperation("LIST", resolved);
    return fs.promises.readdir(resolved);
  }

  checkAccess(filePath: string): boolean {
    try {
      this.guard(filePath, "read");
      const resolved = path.resolve(expandHome(filePath));
      return fs.existsSync(resolved);
    } catch {
      return false;
    }
  }

  getWorkspaceRoot(): string {
    return this.config.workspace_root;
  }
}
