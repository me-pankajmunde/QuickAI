export type Language = "javascript" | "typescript" | "python" | "rust" | "go" | "java" | "cpp" | "c" | "csharp" | "html" | "css" | "json" | "yaml" | "markdown" | "bash" | "sql" | "ruby" | "php" | "swift" | "kotlin" | "scala" | "r" | "lua" | "plaintext";
interface DetectionResult {
    language: Language;
    confidence: number;
}
export declare function detectLanguageFromExtension(filename: string): Language | undefined;
export declare function detectLanguageFromContent(code: string): DetectionResult;
export declare function detectLanguage(code: string, filename?: string): DetectionResult;
export {};
//# sourceMappingURL=languageDetector.d.ts.map