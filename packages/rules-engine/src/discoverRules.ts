import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { RuleRecord } from "./types.ts";

interface RuleSourceSpec {
  readonly extension?: string;
  readonly path: string;
  readonly priority: number;
  readonly type: "dir" | "file";
}

const sourceSpecs: readonly RuleSourceSpec[] = [
  { path: "CONTEXT.md", priority: 10, type: "file" },
  { extension: ".md", path: ".dcc/rules", priority: 20, type: "dir" },
  { extension: ".md", path: ".omo/rules", priority: 30, type: "dir" },
  { extension: ".md", path: ".claude/rules", priority: 40, type: "dir" },
  { extension: ".mdc", path: ".cursor/rules", priority: 50, type: "dir" },
  { path: ".github/copilot-instructions.md", priority: 60, type: "file" },
  { extension: ".md", path: ".github/instructions", priority: 70, type: "dir" },
  { extension: ".md", path: ".codex/rules", priority: 80, type: "dir" },
];

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const normalizeRuleContent = (content: string): string =>
  content
    .replace(/\r\n/g, "\n")
    .replace(/^\s*[-*]\s+/gm, "")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n")
    .toLowerCase();

export const createRuleHash = (content: string): string =>
  createHash("sha256").update(normalizeRuleContent(content)).digest("hex");

const displayPath = (root: string, path: string): string =>
  relative(root, path).split(sep).join("/");

const listRuleFiles = async (
  root: string,
  directory: string,
  extension: string,
): Promise<readonly string[]> => {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRuleFiles(root, path, extension)));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(path);
    }
  }

  return files;
};

const readRule = async (root: string, path: string, priority: number): Promise<RuleRecord> => {
  const content = await readFile(path, "utf8");
  return {
    content: content.trim(),
    normalizedHash: createRuleHash(content),
    priority,
    scope: "project",
    sourcePath: displayPath(root, path),
  };
};

export const discoverRules = async (root: string): Promise<readonly RuleRecord[]> => {
  const rules: RuleRecord[] = [];
  for (const spec of sourceSpecs) {
    if (spec.type === "file") {
      const path = join(root, spec.path);
      try {
        rules.push(await readRule(root, path, spec.priority));
      } catch (error: unknown) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
      continue;
    }

    const files = await listRuleFiles(root, join(root, spec.path), spec.extension ?? ".md");
    for (const file of files) {
      rules.push(await readRule(root, file, spec.priority));
    }
  }

  return rules.sort((left, right) => left.priority - right.priority);
};
