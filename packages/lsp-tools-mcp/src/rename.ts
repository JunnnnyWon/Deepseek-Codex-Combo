import { readFileSync } from "node:fs";
import { runLspStatus } from "./status.ts";
import { referencesForSymbol, symbolAt } from "./symbols.ts";
import type { LspPrepareRenameResult, LspRenameResult } from "./types.ts";

export const runLspPrepareRename = (
  filePath: string,
  line: number,
  character: number,
): LspPrepareRenameResult => {
  if (runLspStatus(filePath).status !== "ok") {
    return {
      canRename: false,
      reason: "LSP unavailable for this file.",
    };
  }

  const symbolName = symbolAt(readFileSync(filePath, "utf8"), line, character);
  if (symbolName === undefined) {
    return {
      canRename: false,
      reason: "No symbol at position for rename.",
    };
  }

  return { canRename: true, symbolName };
};

export const runLspRename = (
  filePath: string,
  line: number,
  character: number,
  newName: string,
): LspRenameResult => {
  const prepare = runLspPrepareRename(filePath, line, character);
  if (!prepare.canRename || prepare.symbolName === undefined || newName.trim().length === 0) {
    return {
      edits: [],
      message: prepare.reason ?? "rename is blocked.",
      outcome: "blocked",
    };
  }

  const oldName = prepare.symbolName;
  const sourceText = readFileSync(filePath, "utf8");
  return {
    edits: referencesForSymbol(sourceText, oldName).map((position) => ({
      ...position,
      newName,
      oldName,
      path: filePath,
    })),
    message: `renaming ${oldName} -> ${newName}`,
    outcome: "ok",
  };
};
