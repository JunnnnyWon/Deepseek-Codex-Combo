import { existsSync } from "node:fs";
import { detectLanguageFromPath } from "./language.ts";
import type { LspStatusResult } from "./types.ts";

export interface LspEnvironment {
  readonly DCC_LSP_DISABLE_PYTHON?: string;
}

export const isPythonDisabled = (env: LspEnvironment = process.env): boolean =>
  env.DCC_LSP_DISABLE_PYTHON === "1";

export const runLspStatus = (
  filePath?: string,
  env: LspEnvironment = process.env,
): LspStatusResult => {
  if (filePath === undefined) {
    return {
      language: "unknown",
      message: "lsp status: ok",
      status: "ok",
      warnings: [],
    };
  }

  const language = detectLanguageFromPath(filePath);
  if (!existsSync(filePath)) {
    return {
      language,
      message: "lsp_unavailable: missing file",
      status: "lsp_unavailable",
      warnings: ["lsp_unavailable", "missing_file"],
    };
  }

  if (language === "python" && isPythonDisabled(env)) {
    return {
      language,
      message: "lsp_unavailable",
      status: "lsp_unavailable",
      warnings: ["lsp_unavailable"],
    };
  }

  if (language === "unknown") {
    return {
      language,
      message: "lsp_unavailable: unsupported language",
      status: "lsp_unavailable",
      warnings: ["lsp_unavailable", "unsupported_language"],
    };
  }

  return {
    language,
    message: "lsp status: ok",
    status: "ok",
    warnings: [],
  };
};
