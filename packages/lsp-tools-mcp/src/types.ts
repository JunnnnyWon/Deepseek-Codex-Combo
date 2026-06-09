export const packageName = "@deepseek-codex-combo/lsp-tools-mcp";
export const LSP_OPERATION_TIMEOUT_MS = 10_000;

export type LspLanguage = "typescript" | "javascript" | "python" | "unknown";
export type LspSeverity = "error" | "warning" | "info" | "hint";
export type LspStatus = "ok" | "lsp_unavailable";

export interface LspStatusResult {
  readonly language: LspLanguage;
  readonly message: string;
  readonly status: LspStatus;
  readonly warnings: readonly string[];
}

export interface LspDiagnostic {
  readonly character: number;
  readonly code: string;
  readonly line: number;
  readonly message: string;
  readonly severity: LspSeverity;
  readonly source: string;
}

export interface LspDiagnosticsResult extends LspStatusResult {
  readonly diagnostics: readonly LspDiagnostic[];
}

export interface LspLocation {
  readonly character: number;
  readonly line: number;
}

export interface LspSymbol {
  readonly character: number;
  readonly kind: string;
  readonly line: number;
  readonly name: string;
}

export interface LspPrepareRenameResult {
  readonly canRename: boolean;
  readonly reason?: string;
  readonly symbolName?: string;
}

export interface LspRenameEdit {
  readonly character: number;
  readonly line: number;
  readonly newName: string;
  readonly oldName: string;
  readonly path: string;
}

export interface LspRenameResult {
  readonly edits: readonly LspRenameEdit[];
  readonly message: string;
  readonly outcome: "blocked" | "ok";
}

export interface LspGotoDefinitionResult {
  readonly location?: LspLocation;
  readonly status: "blocked" | "not_found" | "ok";
  readonly symbolName?: string;
}

export interface LspFindReferencesResult {
  readonly references: readonly LspLocation[];
  readonly status: "blocked" | "not_found" | "ok";
  readonly symbolName?: string;
}
