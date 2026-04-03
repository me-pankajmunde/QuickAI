export interface FilesystemConfig {
    enabled: boolean;
    workspace_root: string;
    deny_list: string[];
    write_requires_confirmation: boolean;
}
export declare class FilesystemManager {
    private config;
    private denyList;
    constructor(config: FilesystemConfig);
    private guard;
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;
    listDir(dirPath: string): Promise<string[]>;
    checkAccess(filePath: string): boolean;
    getWorkspaceRoot(): string;
}
//# sourceMappingURL=filesystem.d.ts.map