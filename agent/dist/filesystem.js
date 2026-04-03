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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesystemManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
const LOG_DIR = path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", "QuickAI", "logs");
function expandHome(p) {
    if (p.startsWith("~/") || p === "~") {
        const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
        return p === "~" ? home : path.join(home, p.slice(2));
    }
    return p;
}
function resolveWorkspaceRoot(root) {
    return path.resolve(expandHome(root));
}
function isInsideWorkspace(filePath, workspaceRoot) {
    const resolved = path.resolve(expandHome(filePath));
    const workspace = resolveWorkspaceRoot(workspaceRoot);
    const relative = path.relative(workspace, resolved);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}
function isDenied(filePath, denyList) {
    const resolved = path.resolve(expandHome(filePath));
    return denyList.some((denied) => {
        const resolvedDenied = expandHome(denied);
        if (resolvedDenied.includes("*")) {
            // Simple wildcard – check prefix
            const prefix = resolvedDenied.replace(/\*.*$/, "");
            return resolved.startsWith(path.resolve(prefix));
        }
        return (resolved === path.resolve(resolvedDenied) ||
            resolved.startsWith(path.resolve(resolvedDenied) + path.sep));
    });
}
async function logOperation(operation, filePath, extra) {
    const entry = `[${new Date().toISOString()}] ${operation} ${filePath}${extra ? " " + extra : ""}\n`;
    try {
        await fs.promises.mkdir(LOG_DIR, { recursive: true });
        await fs.promises.appendFile(path.join(LOG_DIR, "filesystem.log"), entry);
    }
    catch {
        // Non-critical; don't block on log failure.
    }
}
class FilesystemManager {
    constructor(config) {
        this.config = config;
        this.denyList = [...DEFAULT_DENY_LIST, ...(config.deny_list ?? [])];
    }
    guard(filePath, mode) {
        if (!this.config.enabled) {
            throw new Error("Filesystem access is disabled.");
        }
        // CA-051: NEVER access paths outside workspace_root
        if (!isInsideWorkspace(filePath, this.config.workspace_root)) {
            throw new Error(`Access denied (CA-051): ${filePath} is outside workspace root ${this.config.workspace_root}`);
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
    async readFile(filePath) {
        this.guard(filePath, "read");
        const resolved = path.resolve(expandHome(filePath));
        await logOperation("READ", resolved);
        return fs.promises.readFile(resolved, "utf-8");
    }
    async writeFile(filePath, content) {
        this.guard(filePath, "write");
        const resolved = path.resolve(expandHome(filePath));
        // NF-022: Create .bak backup before write
        if (fs.existsSync(resolved) &&
            fs.statSync(resolved).size < 10 * 1024 * 1024) {
            const bakPath = `${resolved}.bak`;
            await fs.promises.copyFile(resolved, bakPath);
            await logOperation("BACKUP", resolved, `→ ${bakPath}`);
        }
        await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
        await fs.promises.writeFile(resolved, content, "utf-8");
        await logOperation("WRITE", resolved);
    }
    async listDir(dirPath) {
        this.guard(dirPath, "read");
        const resolved = path.resolve(expandHome(dirPath));
        await logOperation("LIST", resolved);
        return fs.promises.readdir(resolved);
    }
    checkAccess(filePath) {
        try {
            this.guard(filePath, "read");
            const resolved = path.resolve(expandHome(filePath));
            return fs.existsSync(resolved);
        }
        catch {
            return false;
        }
    }
    getWorkspaceRoot() {
        return this.config.workspace_root;
    }
}
exports.FilesystemManager = FilesystemManager;
//# sourceMappingURL=filesystem.js.map