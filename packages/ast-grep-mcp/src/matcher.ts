import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  type AstGrepMatch,
  LANGUAGE_EXTENSIONS,
  type SearchOptions,
  type SupportedLanguage,
} from "./types.ts";

interface Placeholder {
  readonly token: string;
}

export interface InternalMatch {
  readonly captures: Readonly<Record<string, string>>;
  readonly column: number;
  readonly end: number;
  readonly filePath: string;
  readonly line: number;
  readonly start: number;
  readonly text: string;
}

interface PatternCompiler {
  readonly placeholders: readonly Placeholder[];
  readonly regex: RegExp;
}

export const placeholderPattern = /\$\$\$|\$[A-Za-z_][A-Za-z0-9_]*/g;

const ignoredDirs = new Set([
  ".dcc",
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "vendor",
]);

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  value in LANGUAGE_EXTENSIONS;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertPatternSafe = (pattern: string): void => {
  if (
    pattern.length === 0 ||
    pattern.includes(";") ||
    pattern.includes("`") ||
    !placeholderPattern.test(pattern)
  ) {
    throw new Error("malformed_pattern");
  }
  placeholderPattern.lastIndex = 0;
};

const buildPattern = (pattern: string): PatternCompiler => {
  assertPatternSafe(pattern);
  const placeholders: Placeholder[] = [];
  const sourceParts: string[] = [];
  let cursor = 0;
  let wildcardIndex = 0;

  for (const match of pattern.matchAll(placeholderPattern)) {
    const start = match.index;
    const token = match[0];
    if (start === undefined) {
      continue;
    }
    sourceParts.push(escapeRegExp(pattern.slice(cursor, start)));
    if (token === "$$$") {
      wildcardIndex += 1;
      const wildcardName = `wildcard_${wildcardIndex}`;
      placeholders.push({ token: wildcardName });
      sourceParts.push(`(?<${wildcardName}>[\\s\\S]*?)`);
    } else {
      const name = token.slice(1);
      placeholders.push({ token: name });
      sourceParts.push(`(?<${name}>[\\s\\S]*?)`);
    }
    cursor = start + token.length;
  }

  sourceParts.push(escapeRegExp(pattern.slice(cursor)));
  return { placeholders, regex: new RegExp(sourceParts.join(""), "gms") };
};

const lineAndColumnFromIndex = (
  source: string,
  index: number,
): { column: number; line: number } => {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const newline = before.lastIndexOf("\n");
  return { column: newline === -1 ? index + 1 : index - newline, line };
};

const makeSnippet = (text: string): string => {
  const normalized = text.replace(/\r?\n/g, "\\n");
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
};

const listFiles = (root: string, extensionSet: Set<string>): string[] => {
  const files: string[] = [];
  const walk = (current: string): void => {
    const stat = lstatSync(current);
    if (!stat.isDirectory()) {
      if (stat.isFile() && extensionSet.has(extname(current))) {
        files.push(resolve(current));
      }
      return;
    }
    if (ignoredDirs.has(basename(current)) && resolve(current) !== resolve(root)) {
      return;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isSymbolicLink() && !ignoredDirs.has(entry.name)) {
        walk(join(current, entry.name));
      }
    }
  };
  walk(resolve(root));
  return files.sort();
};

export const readSearchInputs = (
  options: SearchOptions,
): { files: readonly string[]; language: SupportedLanguage } => {
  if (!isSupportedLanguage(options.language)) {
    throw new Error(`malformed_input:${options.language}`);
  }
  if (!existsSync(options.path)) {
    throw new Error("bad_path");
  }
  const language = options.language;
  return { files: listFiles(options.path, new Set(LANGUAGE_EXTENSIONS[language])), language };
};

export const collectMatches = (
  files: readonly string[],
  pattern: string,
  timeoutMs: number,
): InternalMatch[] => {
  const { placeholders, regex } = buildPattern(pattern);
  const matches: InternalMatch[] = [];
  const startTime = Date.now();

  for (const filePath of files) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("timeout");
    }
    const source = readFileSync(filePath, "utf8");
    regex.lastIndex = 0;
    let hit = regex.exec(source);
    while (hit !== null) {
      const captureRecord: Record<string, string> = {};
      for (const key of placeholders) {
        captureRecord[key.token] = hit.groups?.[key.token] ?? "";
      }
      const { column, line } = lineAndColumnFromIndex(source, hit.index);
      matches.push({
        captures: captureRecord,
        column,
        end: hit.index + hit[0].length,
        filePath,
        line,
        start: hit.index,
        text: hit[0],
      });
      hit = regex.exec(source);
    }
  }

  return matches;
};

export const toPublicMatch = (entry: InternalMatch): AstGrepMatch => ({
  captures: entry.captures,
  column: entry.column,
  filePath: relative(process.cwd(), entry.filePath),
  line: entry.line,
  snippet: makeSnippet(entry.text),
  text: entry.text,
});
