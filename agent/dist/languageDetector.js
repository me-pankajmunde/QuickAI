"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguageFromExtension = detectLanguageFromExtension;
exports.detectLanguageFromContent = detectLanguageFromContent;
exports.detectLanguage = detectLanguage;
// Extension → language map
const EXT_MAP = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    pyw: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    c: "c",
    h: "c",
    cs: "csharp",
    html: "html",
    htm: "html",
    css: "css",
    scss: "css",
    less: "css",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    markdown: "markdown",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    kts: "kotlin",
    scala: "scala",
    r: "r",
    lua: "lua",
};
// Keyword patterns for content-based detection
const PATTERNS = [
    {
        language: "typescript",
        patterns: [
            /:\s*(string|number|boolean|any|void|never|unknown)\b/,
            /interface\s+\w+\s*\{/,
            /type\s+\w+\s*=/,
            /as\s+(string|number|boolean|any)\b/,
            /<[A-Z]\w*>/,
        ],
        weight: 3,
    },
    {
        language: "javascript",
        patterns: [
            /\bconst\b|\blet\b|\bvar\b/,
            /=>\s*[\{\(]/,
            /require\s*\(/,
            /module\.exports/,
            /\bconsole\.log\b/,
        ],
        weight: 1,
    },
    {
        language: "python",
        patterns: [
            /^\s*def\s+\w+\s*\(/m,
            /^\s*class\s+\w+[:(]/m,
            /^\s*import\s+\w+/m,
            /^\s*from\s+\w+\s+import/m,
            /print\s*\(/,
        ],
        weight: 2,
    },
    {
        language: "rust",
        patterns: [
            /\bfn\s+\w+\s*[<(]/,
            /\blet\s+mut\b/,
            /\bimpl\s+\w+/,
            /\buse\s+std::/,
            /->\s*\w+(\s*\{|;)/,
        ],
        weight: 3,
    },
    {
        language: "go",
        patterns: [
            /\bfunc\s+\w+\s*\(/,
            /\bpackage\s+\w+/,
            /\bimport\s+\(/,
            /:=\s/,
            /\bfmt\.\w+\(/,
        ],
        weight: 3,
    },
    {
        language: "java",
        patterns: [
            /\bpublic\s+(class|interface|enum)\s+\w+/,
            /\bSystem\.out\.println\b/,
            /@Override\b/,
            /\bimport\s+java\.\w+/,
            /\bprivate\s+\w+\s+\w+\s*=/,
        ],
        weight: 2,
    },
    {
        language: "cpp",
        patterns: [
            /#include\s*<\w+>/,
            /\bstd::\w+/,
            /\bnamespace\s+\w+/,
            /\bcout\s*<</,
            /\btemplate\s*</,
        ],
        weight: 3,
    },
    {
        language: "c",
        patterns: [
            /#include\s*<stdio\.h>/,
            /\bprintf\s*\(/,
            /\bscanf\s*\(/,
            /\bvoid\s+main\s*\(/,
            /\bstruct\s+\w+\s*\{/,
        ],
        weight: 2,
    },
    {
        language: "html",
        patterns: [
            /<!DOCTYPE\s+html/i,
            /<html[\s>]/i,
            /<\/?(div|span|p|a|img|head|body|script|link)\b/i,
        ],
        weight: 5,
    },
    {
        language: "css",
        patterns: [
            /[\w.#\[\]:-]+\s*\{[^}]*\}/,
            /@(media|keyframes|import|charset)\b/,
            /:(hover|focus|active|nth-child)\b/,
        ],
        weight: 3,
    },
    {
        language: "sql",
        patterns: [
            /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i,
            /\bFROM\s+\w+/i,
            /\bWHERE\s+\w+/i,
        ],
        weight: 4,
    },
    {
        language: "bash",
        patterns: [
            /^#!/,
            /\$\w+/,
            /\b(echo|export|source|alias)\b/,
            /&&|\|\|/,
            /\[\s+.*\s+\]/,
        ],
        weight: 2,
    },
    {
        language: "ruby",
        patterns: [
            /\bdef\s+\w+/,
            /\bend\b/,
            /\bputs\b/,
            /require\s+['"][\w\/]+['"]/,
            /\.each\s+do\s*\|/,
        ],
        weight: 2,
    },
];
function detectLanguageFromExtension(filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && ext in EXT_MAP)
        return EXT_MAP[ext];
    return undefined;
}
function detectLanguageFromContent(code) {
    const scores = new Map();
    for (const { language, patterns, weight } of PATTERNS) {
        for (const pattern of patterns) {
            if (pattern.test(code)) {
                scores.set(language, (scores.get(language) ?? 0) + weight);
            }
        }
    }
    if (scores.size === 0)
        return { language: "plaintext", confidence: 0 };
    // Pick highest score
    let best = "plaintext";
    let bestScore = 0;
    for (const [lang, score] of scores) {
        if (score > bestScore) {
            best = lang;
            bestScore = score;
        }
    }
    const total = [...scores.values()].reduce((a, b) => a + b, 0);
    return { language: best, confidence: total > 0 ? bestScore / total : 0 };
}
function detectLanguage(code, filename) {
    if (filename) {
        const fromExt = detectLanguageFromExtension(filename);
        if (fromExt)
            return { language: fromExt, confidence: 1.0 };
    }
    return detectLanguageFromContent(code);
}
//# sourceMappingURL=languageDetector.js.map