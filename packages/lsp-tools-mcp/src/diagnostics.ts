import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { detectLanguageFromPath, lineColumnAt } from "./language.ts";
import { isPythonDisabled, type LspEnvironment, runLspStatus } from "./status.ts";
import {
  LSP_OPERATION_TIMEOUT_MS,
  type LspDiagnostic,
  type LspDiagnosticsResult,
} from "./types.ts";

const severityFromCategory = (category: ts.DiagnosticCategory): "error" | "warning" =>
  category === ts.DiagnosticCategory.Warning ? "warning" : "error";

const codeFromCategory = (category: ts.DiagnosticCategory): string =>
  category === ts.DiagnosticCategory.Warning ? "ts_warning_diagnostic" : "ts_error_diagnostic";

const formatTsMessage = (value: string | ts.DiagnosticMessageChain): string =>
  ts.flattenDiagnosticMessageText(value, "\n");

const fromTsDiagnostic = (sourceText: string, diagnostic: ts.Diagnostic): LspDiagnostic => {
  const position = diagnostic.start ?? 0;
  const location = lineColumnAt(sourceText, position);
  return {
    ...location,
    code: codeFromCategory(diagnostic.category),
    message: formatTsMessage(diagnostic.messageText),
    severity: severityFromCategory(diagnostic.category),
    source: "typescript",
  };
};

const consoleWarning = (sourceText: string): readonly LspDiagnostic[] => {
  const marker = "console.log";
  const position = sourceText.indexOf(marker);
  if (position === -1) {
    return [];
  }

  return [
    {
      ...lineColumnAt(sourceText, position),
      code: "ts_warning_diagnostic",
      message: "console.log call detected by lightweight diagnostics policy.",
      severity: "warning",
      source: "typescript",
    },
  ];
};

const runTypeScriptDiagnostics = (
  filePath: string,
  sourceText: string,
): readonly LspDiagnostic[] => {
  const result = ts.transpileModule(sourceText, {
    compilerOptions: {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });
  return [
    ...(result.diagnostics ?? []).map((diagnostic) => fromTsDiagnostic(sourceText, diagnostic)),
    ...consoleWarning(sourceText),
  ];
};

const runPythonDiagnostics = (sourceText: string): readonly LspDiagnostic[] => {
  const position = sourceText.indexOf("TODO");
  if (position === -1) {
    return [];
  }

  return [
    {
      ...lineColumnAt(sourceText, position),
      code: "python_warning",
      message: "TODO marker found.",
      severity: "warning",
      source: "python",
    },
  ];
};

const runBounded = <T>(operation: () => T): T => {
  const start = Date.now();
  const result = operation();
  if (Date.now() - start > LSP_OPERATION_TIMEOUT_MS) {
    throw new Error("lsp_timeout");
  }
  return result;
};

export const runLspDiagnosticsFromText = (
  text: string,
  fileName: string,
  env: LspEnvironment = process.env,
): LspDiagnosticsResult => {
  const language = detectLanguageFromPath(fileName);
  const status =
    language === "python" && isPythonDisabled(env)
      ? {
          language,
          message: "lsp_unavailable",
          status: "lsp_unavailable" as const,
          warnings: ["lsp_unavailable"],
        }
      : {
          language,
          message: "lsp status: ok",
          status: "ok" as const,
          warnings: [],
        };
  const diagnostics = runBounded(() => {
    if (language === "typescript" || language === "javascript") {
      return runTypeScriptDiagnostics(fileName, text);
    }
    if (language === "python" && !isPythonDisabled(env)) {
      return runPythonDiagnostics(text);
    }
    return [];
  });

  return { ...status, diagnostics };
};

export const runLspDiagnostics = (
  filePath: string,
  env: LspEnvironment = process.env,
): LspDiagnosticsResult => {
  const status = runLspStatus(filePath, env);
  if (status.status !== "ok") {
    return { ...status, diagnostics: [] };
  }

  try {
    return runLspDiagnosticsFromText(readFileSync(filePath, "utf8"), filePath, env);
  } catch (error) {
    return {
      diagnostics: [],
      language: status.language,
      message: "lsp_unavailable while collecting diagnostics",
      status: "lsp_unavailable",
      warnings: ["lsp_unavailable", error instanceof Error ? error.message : "unknown_error"],
    };
  }
};
