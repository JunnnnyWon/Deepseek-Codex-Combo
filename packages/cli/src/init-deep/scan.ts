import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { z } from "zod";

const codeExtensions = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cts",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".ts",
  ".tsx",
]);
const ignoredDirectories = new Set([".dcc", ".git", ".next", ".turbo", "coverage", "node_modules"]);
const generatedDirectories = new Set(["build", "dist", "generated", "out", "target", "vendor"]);
const managedFileNames = new Set(["AGENTS.md"]);
const packageManifestNames = ["Cargo.toml", "go.mod", "package.json", "pyproject.toml"] as const;
const packageJsonSchema = z.object({
  name: z.string().optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});
const fixtureSchema = z.object({
  commands: z.array(z.string()).optional(),
  name: z.string().optional(),
  status: z.string().optional(),
});

const parseJson = (text: string): unknown => JSON.parse(text);

export interface PackageBoundary {
  readonly commands: readonly string[];
  readonly kind: "go" | "node" | "python" | "rust";
  readonly name: string;
  readonly path: string;
}

export interface ProjectAnalysis {
  readonly buildCommands: readonly string[];
  readonly fileCount: number;
  readonly generatedFiles: readonly string[];
  readonly loc: number;
  readonly migrationFiles: readonly string[];
  readonly packageBoundaries: readonly PackageBoundary[];
  readonly productSourceFiles: readonly string[];
  readonly publicApiFiles: readonly string[];
  readonly securitySensitiveFiles: readonly string[];
  readonly testFiles: readonly string[];
  readonly uncertainty: readonly string[];
}

const normalize = (value: string): string => value.split(sep).join("/");

const isGeneratedPath = (path: string): boolean =>
  normalize(path)
    .split("/")
    .some((segment) => generatedDirectories.has(segment));

const isPackageBoundary = (path: string): boolean =>
  packageManifestNames.includes(basename(path) as (typeof packageManifestNames)[number]);

const isTestPath = (path: string): boolean => {
  const normalized = normalize(path);
  const fileName = basename(normalized);
  return (
    normalized.includes("/__tests__/") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    fileName.includes(".spec.") ||
    fileName.includes(".test.")
  );
};

const isSecuritySensitivePath = (path: string): boolean =>
  /(^|\/)\.env(\.|$)|auth|credential|secret|token|key/i.test(normalize(path));

const isMigrationPath = (path: string): boolean =>
  /legacy|migration|migrate/i.test(normalize(path));

const isPublicApiPath = (path: string): boolean => {
  const normalized = normalize(path);
  const fileName = basename(normalized);
  return (
    normalized === "app.py" ||
    normalized.endsWith("/app.py") ||
    normalized.endsWith("/src/index.ts") ||
    normalized.endsWith("/src/index.tsx") ||
    normalized.endsWith("/src/index.js") ||
    normalized.endsWith("/src/index.mjs") ||
    fileName === "main.rs"
  );
};

const isProductSourcePath = (path: string): boolean =>
  codeExtensions.has(extname(path)) && !isGeneratedPath(path) && !isTestPath(path);

const countLoc = (text: string): number =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;

const collectFiles = async (root: string, current: string): Promise<readonly string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(current, entry.name);
    const relPath = normalize(relative(root, fullPath));

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      files.push(...(await collectFiles(root, fullPath)));
      continue;
    }

    if (entry.isFile() && !managedFileNames.has(entry.name)) {
      files.push(relPath);
    }
  }

  return files;
};

const readCommandsFromPackageBoundary = async (
  cwd: string,
  relPath: string,
  uncertainty: string[],
): Promise<PackageBoundary> => {
  const filePath = join(cwd, relPath);
  const fileName = basename(relPath);
  const parentPath = normalize(relative(cwd, join(filePath, "..")));

  if (fileName === "package.json") {
    const parsed = packageJsonSchema.parse(parseJson(await readFile(filePath, "utf8")));
    const scripts = parsed.scripts ?? {};
    const commands = ["build", "lint", "test", "typecheck"]
      .map((name) => scripts[name])
      .filter((value): value is string => value !== undefined);
    return {
      commands,
      kind: "node",
      name: parsed.name ?? (parentPath === "" ? "root" : parentPath),
      path: parentPath === "" ? "." : parentPath,
    };
  }

  if (fileName === "pyproject.toml") {
    uncertainty.push("pyproject.toml scripts could not be parsed for build/test commands.");
    return {
      commands: [],
      kind: "python",
      name: parentPath === "" ? "root" : parentPath,
      path: parentPath === "" ? "." : parentPath,
    };
  }

  if (fileName === "Cargo.toml") {
    uncertainty.push("Cargo.toml commands were inferred conservatively as cargo build/test.");
    return {
      commands: ["cargo build", "cargo test"],
      kind: "rust",
      name: parentPath === "" ? "root" : parentPath,
      path: parentPath === "" ? "." : parentPath,
    };
  }

  uncertainty.push("go.mod commands were inferred conservatively as go test ./....");
  return {
    commands: ["go test ./..."],
    kind: "go",
    name: parentPath === "" ? "root" : parentPath,
    path: parentPath === "" ? "." : parentPath,
  };
};

const readFixtureCommands = async (cwd: string): Promise<readonly string[]> => {
  const fixturePath = join(cwd, "fixture.json");
  try {
    const parsed = fixtureSchema.parse(parseJson(await readFile(fixturePath, "utf8")));
    return parsed.commands ?? [];
  } catch {
    return [];
  }
};

export const analyzeProject = async (cwd: string): Promise<ProjectAnalysis> => {
  const files = (await collectFiles(cwd, cwd)).toSorted((left, right) => left.localeCompare(right));
  const uncertainty = [
    "Project memory is generated from filesystem sampling; confirm architectural details before major refactors.",
  ];
  const packageBoundaries = await Promise.all(
    files
      .filter(isPackageBoundary)
      .map(async (file) => readCommandsFromPackageBoundary(cwd, file, uncertainty)),
  );
  const fixtureCommands = await readFixtureCommands(cwd);
  const productSourceFiles = files.filter(isProductSourcePath);

  if (productSourceFiles.length === 0) {
    const error = new Error("insufficient_source_context");
    Object.assign(error, { code: "insufficient_source_context" });
    throw error;
  }

  const locCounts = await Promise.all(
    files
      .filter((file) => codeExtensions.has(extname(file)))
      .map(async (file) => countLoc(await readFile(join(cwd, file), "utf8"))),
  );
  const buildCommands = [
    ...new Set([...packageBoundaries.flatMap((boundary) => boundary.commands), ...fixtureCommands]),
  ].toSorted((left, right) => left.localeCompare(right));

  if (buildCommands.length === 0) {
    uncertainty.push(
      "No build/test commands were detected from package manifests or fixture metadata.",
    );
  }
  if (!files.some((file) => isTestPath(file))) {
    uncertainty.push(
      "No test files were detected; validate expectations before using generated testing guidance.",
    );
  }
  if (!files.some((file) => isPublicApiPath(file))) {
    uncertainty.push("No obvious public API entrypoints were detected automatically.");
  }

  return {
    buildCommands,
    fileCount: files.length,
    generatedFiles: files.filter(isGeneratedPath),
    loc: locCounts.reduce((sum, value) => sum + value, 0),
    migrationFiles: files.filter(isMigrationPath),
    packageBoundaries,
    productSourceFiles,
    publicApiFiles: files.filter(isPublicApiPath),
    securitySensitiveFiles: files.filter(isSecuritySensitivePath),
    testFiles: files.filter(isTestPath),
    uncertainty: uncertainty.toSorted((left, right) => left.localeCompare(right)),
  };
};
