import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export interface HashlineEntry {
  readonly hash: string;
  readonly lineNumber: number;
  readonly text: string;
}

export interface ReadHashlineResult {
  readonly entries: readonly HashlineEntry[];
}

export interface ApplyHashlinePatchResult {
  readonly applied: boolean;
  readonly content?: string;
  readonly refreshSuggested: boolean;
  readonly reason?: string;
}

const hashLine = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 8);

const splitLines = (content: string): string[] => content.replace(/\r\n/g, "\n").split("\n");

export const readWithHashes = (content: string): ReadHashlineResult => ({
  entries: splitLines(content).map((text, index) => ({
    hash: hashLine(text),
    lineNumber: index + 1,
    text,
  })),
});

export const formatHashlineRead = (content: string): string =>
  readWithHashes(content)
    .entries.map((entry) => `L${entry.lineNumber}#${entry.hash} ${entry.text}`)
    .join("\n");

export const verifyHashlinePatch = (actualLine: string, expectedHash: string): boolean =>
  hashLine(actualLine) === expectedHash;

export const applyHashlinePatch = (
  originalContent: string,
  patchContent: string,
): ApplyHashlinePatchResult => {
  const allPatchLines = splitLines(patchContent).filter((line) => line.length > 0);
  const patchLines = allPatchLines[0]?.startsWith("path: ")
    ? allPatchLines.slice(1)
    : allPatchLines;
  const patchHeader = patchLines[0];
  if (patchHeader === undefined || !patchHeader.startsWith("@@ ")) {
    return {
      applied: false,
      reason: "invalid_patch",
      refreshSuggested: false,
    };
  }

  const match = /^@@ L(\d+)#([0-9a-f]{8})$/.exec(patchHeader);
  if (match === null) {
    return {
      applied: false,
      reason: "invalid_patch",
      refreshSuggested: false,
    };
  }

  const [, lineNumberText, expectedHash] = match;
  if (lineNumberText === undefined || expectedHash === undefined) {
    return {
      applied: false,
      reason: "invalid_patch",
      refreshSuggested: false,
    };
  }

  const lineNumber = Number(lineNumberText);
  const originalLines = splitLines(originalContent);
  const currentLine = originalLines[lineNumber - 1];
  if (currentLine === undefined) {
    return {
      applied: false,
      reason: "invalid_line",
      refreshSuggested: true,
    };
  }

  if (!verifyHashlinePatch(currentLine, expectedHash)) {
    return {
      applied: false,
      reason: "hash_mismatch",
      refreshSuggested: true,
    };
  }

  const nextLine = patchLines.find((line) => line.startsWith("+ "));
  if (nextLine === undefined) {
    return {
      applied: false,
      reason: "invalid_patch",
      refreshSuggested: false,
    };
  }

  originalLines[lineNumber - 1] = nextLine.slice(2);
  return {
    applied: true,
    content: originalLines.join("\n"),
    refreshSuggested: false,
  };
};

export const readHashlineFile = async (path: string): Promise<string> =>
  formatHashlineRead(await readFile(path, "utf8"));

export const applyHashlinePatchFile = async (
  contentPath: string,
  patchPath: string,
): Promise<ApplyHashlinePatchResult> => {
  const [content, patch] = await Promise.all([
    readFile(contentPath, "utf8"),
    readFile(patchPath, "utf8"),
  ]);
  const result = applyHashlinePatch(content, patch);
  if (result.applied && result.content !== undefined) {
    await writeFile(contentPath, result.content, "utf8");
  }
  return result;
};
