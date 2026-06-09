import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { createGeneratedFiles, type GeneratedFile } from "./init-deep/render.ts";
import { analyzeProject } from "./init-deep/scan.ts";

export interface InitDeepOptions {
  readonly cwd: string;
  readonly dryRun?: boolean;
  readonly refreshNestedAgents?: boolean;
}

export interface InitDeepResult {
  readonly generatedFiles: readonly string[];
  readonly lines: readonly string[];
}

interface ManagedBlock {
  readonly end: number;
  readonly text: string;
  readonly start: number;
}

const codeExtensions = new Set([".go", ".js", ".jsx", ".mjs", ".py", ".rs", ".ts", ".tsx"]);
const ignoredDirectories = new Set([".dcc", ".git", ".next", ".turbo", "coverage", "node_modules"]);
const generatedDirectories = new Set(["build", "dist", "generated", "out", "target", "vendor"]);
const nestedAgentThreshold = 30;

const normalize = (value: string): string => value.split(sep).join("/");

const isGeneratedPath = (path: string): boolean =>
  normalize(path)
    .split("/")
    .some((segment) => generatedDirectories.has(segment));

const isCodeFile = (path: string): boolean => codeExtensions.has(extname(path));

const assertDirectory = async (path: string): Promise<void> => {
  const stats = await stat(path).catch(() => undefined);
  if (stats?.isDirectory() !== true) {
    throw new Error("invalid_cwd");
  }
};

const readOptionalText = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

const findManagedBlock = (text: string): ManagedBlock | undefined => {
  const startMatch = /<!-- dcc-managed: ([a-z0-9-]+) START -->/.exec(text);
  if (startMatch === null) {
    return undefined;
  }
  const marker = startMatch[1];
  if (marker === undefined) {
    return undefined;
  }
  const endMarker = `<!-- dcc-managed: ${marker} END -->`;
  const endIndex = text.indexOf(endMarker, startMatch.index);
  if (endIndex === -1) {
    return undefined;
  }
  const end = endIndex + endMarker.length;
  return { end, start: startMatch.index, text: text.slice(startMatch.index, end) };
};

const mergeMarkdown = (current: string | undefined, generated: string): string => {
  const generatedBlock = findManagedBlock(generated);
  if (generatedBlock === undefined || current === undefined || current.trim().length === 0) {
    return generated;
  }

  const currentBlock = findManagedBlock(current);
  if (currentBlock === undefined) {
    return `${current.trimEnd()}\n\n${generatedBlock.text}\n`;
  }

  return `${current.slice(0, currentBlock.start)}${generatedBlock.text}${current.slice(currentBlock.end)}`;
};

const writeGeneratedFile = async (cwd: string, file: GeneratedFile): Promise<void> => {
  const path = join(cwd, file.path);
  const current = await readOptionalText(path);
  const next =
    file.path.endsWith(".md") || file.path === "AGENTS.md"
      ? mergeMarkdown(current, file.content)
      : file.content;
  if (current === next) {
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, "utf8");
};

const collectCodeFiles = async (root: string, current: string): Promise<readonly string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(current, entry.name);
    const relPath = normalize(relative(root, fullPath));

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && !isGeneratedPath(relPath)) {
        files.push(...(await collectCodeFiles(root, fullPath)));
      }
      continue;
    }

    if (entry.isFile() && isCodeFile(relPath) && !isGeneratedPath(relPath)) {
      files.push(relPath);
    }
  }

  return files;
};

const nestedAgentFiles = async (cwd: string): Promise<readonly GeneratedFile[]> => {
  const files = await collectCodeFiles(cwd, cwd);
  const counts = new Map<string, number>();
  for (const file of files) {
    const directory = normalize(dirname(file));
    if (directory === ".") {
      continue;
    }
    counts.set(directory, (counts.get(directory) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= nestedAgentThreshold)
    .map(([directory]) => ({
      content: [
        "# Directory Memory",
        "",
        "<!-- dcc-managed: agents START -->",
        `This local guidance covers the \`${directory}\` subtree.`,
        "- Keep generated and vendor-managed files read-only unless regeneration is explicit.",
        "- Prefer nearby tests and package commands when editing this subtree.",
        "<!-- dcc-managed: agents END -->",
        "",
      ].join("\n"),
      path: `${directory}/AGENTS.md`,
    }))
    .toSorted((left, right) => left.path.localeCompare(right.path));
};

export const runInitDeep = async (options: InitDeepOptions): Promise<InitDeepResult> => {
  const cwd = resolve(options.cwd);
  await assertDirectory(cwd);

  const analysis = await analyzeProject(cwd);
  const rootFiles = createGeneratedFiles(analysis);
  const nestedFiles = options.refreshNestedAgents === false ? [] : await nestedAgentFiles(cwd);
  const generatedFiles = [...rootFiles, ...nestedFiles];

  if (options.dryRun === true) {
    return {
      generatedFiles: generatedFiles.map((file) => file.path),
      lines: generatedFiles.map((file) => `would write: ${file.path}`),
    };
  }

  for (const file of generatedFiles) {
    await writeGeneratedFile(cwd, file);
  }

  return {
    generatedFiles: generatedFiles.map((file) => file.path),
    lines: generatedFiles.map((file) => `written: ${file.path}`),
  };
};
