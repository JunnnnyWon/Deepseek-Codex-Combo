import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import {
  collectMatches,
  type InternalMatch,
  placeholderPattern,
  readSearchInputs,
  toPublicMatch,
} from "./matcher.ts";
import {
  type AstGrepRewriteMatch,
  type AstGrepRewriteResult,
  type AstGrepSearchResult,
  type RewriteOptions,
  type SearchOptions,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "./types.ts";

const maxRewrite = 100;
const maxOperationMs = 5_000;

export const runAstGrepListLanguages = (): readonly SupportedLanguage[] =>
  [...SUPPORTED_LANGUAGES].sort() as readonly SupportedLanguage[];

const timeoutFor = (options: SearchOptions): number =>
  Math.min(maxOperationMs, options.timeoutMs ?? maxOperationMs);

const readCapture = (captures: Readonly<Record<string, string>>, key: string): string =>
  captures[key] ?? "";

const renderRewrite = (rewrite: string, captures: Readonly<Record<string, string>>): string =>
  rewrite.replace(placeholderPattern, (token) => {
    if (token === "$$$") {
      return readCapture(captures, "wildcard_1");
    }
    return readCapture(captures, token.slice(1));
  });

const buildRewriteMatches = (
  matches: readonly InternalMatch[],
  rewrite: string,
): readonly AstGrepRewriteMatch[] =>
  matches.map((entry) => ({
    ...toPublicMatch(entry),
    after: renderRewrite(rewrite, entry.captures),
    before: entry.text,
  }));

const writeRewriteResults = (
  matches: readonly InternalMatch[],
  rewrite: string,
): readonly string[] => {
  const changedFiles = new Set<string>();
  for (const filePath of [...new Set(matches.map((entry) => entry.filePath))]) {
    const source = readFileSync(filePath, "utf8");
    let output = source;
    const fileMatches = matches
      .filter((match) => match.filePath === filePath)
      .sort((left, right) => right.start - left.start);
    for (const entry of fileMatches) {
      output = `${output.slice(0, entry.start)}${renderRewrite(rewrite, entry.captures)}${output.slice(entry.end)}`;
    }
    if (output !== source) {
      writeFileSync(filePath, output, "utf8");
      changedFiles.add(relative(process.cwd(), filePath));
    }
  }
  return [...changedFiles].sort();
};

export const runAstGrepSearch = (options: SearchOptions): AstGrepSearchResult => {
  const { files, language } = readSearchInputs(options);
  const publicMatches = collectMatches(files, options.pattern, timeoutFor(options)).map(
    toPublicMatch,
  );
  return { language, matchCount: publicMatches.length, matches: publicMatches, path: options.path };
};

export const runAstGrepRewrite = (options: RewriteOptions): AstGrepRewriteResult => {
  if (options.rewrite.length === 0) {
    throw new Error("invalid_rewrite");
  }
  const { files, language } = readSearchInputs(options);
  const dryRun = options.dryRun !== false;
  const matches = collectMatches(files, options.pattern, timeoutFor(options));
  const rewriteMatches = buildRewriteMatches(matches, options.rewrite);

  if (dryRun || matches.length === 0) {
    return {
      changedFiles: [],
      dryRun,
      language,
      matchCount: rewriteMatches.length,
      matches: rewriteMatches,
      path: options.path,
    };
  }
  if (matches.length > maxRewrite && options.confirm !== true) {
    throw new Error("confirmation_required");
  }

  return {
    changedFiles: writeRewriteResults(matches, options.rewrite),
    dryRun,
    language,
    matchCount: rewriteMatches.length,
    matches: rewriteMatches,
    path: options.path,
  };
};
