import { readFileSync } from "node:fs";
import { escapeRegExp } from "./language.ts";
import { runLspStatus } from "./status.ts";
import type {
  LspFindReferencesResult,
  LspGotoDefinitionResult,
  LspLocation,
  LspSymbol,
} from "./types.ts";

const declarationPattern =
  /\b(function|const|let|var|class|interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*/g;

const parseSymbolsFromLine = (lineNumber: number, line: string): readonly LspSymbol[] => {
  const symbols: LspSymbol[] = [];
  for (const match of line.matchAll(declarationPattern)) {
    const name = match[2] ?? "";
    if (name.length > 0) {
      symbols.push({
        character: (match.index ?? 0) + 1,
        kind: match[1] ?? "identifier",
        line: lineNumber,
        name,
      });
    }
  }

  for (const match of line.matchAll(identifierPattern)) {
    const name = match[0];
    if (!symbols.some((symbol) => symbol.name === name)) {
      symbols.push({
        character: (match.index ?? 0) + 1,
        kind: "identifier",
        line: lineNumber,
        name,
      });
    }
  }
  return symbols;
};

export const symbolAt = (
  sourceText: string,
  line: number,
  character: number,
): string | undefined => {
  const targetLine = sourceText.split(/\r?\n/)[line - 1];
  if (targetLine === undefined) {
    return undefined;
  }

  for (const match of targetLine.matchAll(identifierPattern)) {
    const start = (match.index ?? 0) + 1;
    const end = start + match[0].length - 1;
    if (character >= start && character <= end) {
      return match[0];
    }
  }
  return undefined;
};

export const referencesForSymbol = (
  sourceText: string,
  symbolName: string,
): readonly LspLocation[] => {
  const pattern = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, "g");
  return sourceText.split(/\r?\n/).flatMap((line, lineIndex) =>
    Array.from(line.matchAll(pattern), (match) => ({
      character: (match.index ?? 0) + 1,
      line: lineIndex + 1,
    })),
  );
};

export const runLspSymbols = (filePath: string): readonly LspSymbol[] => {
  if (runLspStatus(filePath).status !== "ok") {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) => Array.from(parseSymbolsFromLine(index + 1, line)));
};

export const runLspGotoDefinition = (
  filePath: string,
  line: number,
  character: number,
): LspGotoDefinitionResult => {
  if (runLspStatus(filePath).status !== "ok") {
    return { status: "blocked" };
  }
  const sourceText = readFileSync(filePath, "utf8");
  const name = symbolAt(sourceText, line, character);
  if (name === undefined) {
    return { status: "not_found" };
  }
  const firstReference = referencesForSymbol(sourceText, name)[0];
  return firstReference === undefined
    ? { status: "not_found", symbolName: name }
    : { location: firstReference, status: "ok", symbolName: name };
};

export const runLspFindReferences = (
  filePath: string,
  line: number,
  character: number,
): LspFindReferencesResult => {
  if (runLspStatus(filePath).status !== "ok") {
    return { references: [], status: "blocked" };
  }
  const sourceText = readFileSync(filePath, "utf8");
  const name = symbolAt(sourceText, line, character);
  return name === undefined
    ? { references: [], status: "not_found" }
    : { references: referencesForSymbol(sourceText, name), status: "ok", symbolName: name };
};
