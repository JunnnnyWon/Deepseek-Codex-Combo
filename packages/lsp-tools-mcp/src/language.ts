import { extname } from "node:path";
import type { LspLanguage, LspLocation } from "./types.ts";

export const detectLanguageFromPath = (filePath: string): LspLanguage => {
  const ext = extname(filePath).toLowerCase();
  if ([".ts", ".tsx", ".cts", ".mts"].includes(ext)) {
    return "typescript";
  }
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return "javascript";
  }
  if (ext === ".py") {
    return "python";
  }
  return "unknown";
};

export const lineColumnAt = (source: string, position: number): LspLocation => {
  const lines = source.slice(0, position).split(/\r?\n/);
  const lineText = lines.at(-1) ?? "";
  return {
    character: lineText.replace(/\r$/, "").length + 1,
    line: lines.length,
  };
};

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
