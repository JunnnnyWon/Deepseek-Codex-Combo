export const packageName = "@deepseek-codex-combo/ast-grep-mcp";

export const LANGUAGE_EXTENSIONS = {
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  jsx: [".jsx", ".js", ".tsx", ".ts"],
  python: [".py"],
  tsx: [".tsx", ".ts", ".jsx", ".js"],
  typescript: [".ts", ".tsx", ".mts", ".cts"],
} as const;

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_EXTENSIONS) as Array<
  keyof typeof LANGUAGE_EXTENSIONS
>;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface AstGrepMatch {
  readonly captures: Readonly<Record<string, string>>;
  readonly column: number;
  readonly filePath: string;
  readonly line: number;
  readonly snippet: string;
  readonly text: string;
}

export interface AstGrepSearchResult {
  readonly language: SupportedLanguage;
  readonly matchCount: number;
  readonly matches: readonly AstGrepMatch[];
  readonly path: string;
}

export interface AstGrepRewriteMatch extends AstGrepMatch {
  readonly after: string;
  readonly before: string;
}

export interface AstGrepRewriteResult {
  readonly changedFiles: readonly string[];
  readonly dryRun: boolean;
  readonly language: SupportedLanguage;
  readonly matchCount: number;
  readonly matches: readonly AstGrepRewriteMatch[];
  readonly path: string;
}

export interface SearchOptions {
  readonly language: string;
  readonly path: string;
  readonly pattern: string;
  readonly timeoutMs?: number;
}

export interface RewriteOptions extends SearchOptions {
  readonly confirm?: boolean;
  readonly dryRun?: boolean;
  readonly rewrite: string;
}
