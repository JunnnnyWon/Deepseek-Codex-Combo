import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { acquirePluginDistLock } from "./pluginDistLock.ts";
import { shouldExcludeReleasePath } from "./releaseFilters.ts";

export interface ReleasePackageOptions {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly outDir: string;
}

export interface ReleaseFileEntry {
  readonly bytes: number;
  readonly category: string;
  readonly path: string;
  readonly sha256: string;
}

export interface ReleaseManifest {
  readonly dryRun: boolean;
  readonly files: readonly ReleaseFileEntry[];
  readonly generatedBy: "dcc package";
  readonly packageName: "deepseek-codex-combo";
}

export interface ChecksumManifest {
  readonly files: readonly Pick<ReleaseFileEntry, "path" | "sha256">[];
}

export interface ReleasePackageResult {
  readonly checksumManifestPath: string;
  readonly copiedFiles: number;
  readonly dryRun: boolean;
  readonly fileCount: number;
  readonly manifestPath: string;
  readonly outDir: string;
}

const requiredTopLevelFiles = [
  "bin/dcc.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.base.json",
  "biome.json",
  ".agents/plugins/marketplace.json",
  ".github/workflows/ci.yml",
  "README.md",
  "CHANGELOG.md",
] as const;

const packageManifestFiles = [
  "packages/ast-grep-mcp/package.json",
  "packages/boulder-state/package.json",
  "packages/cli/package.json",
  "packages/codex-installer/package.json",
  "packages/comment-checker-core/package.json",
  "packages/hashline-core/package.json",
  "packages/lsp-tools-mcp/package.json",
  "packages/model-core/package.json",
  "packages/prompts-core/package.json",
  "packages/provider-proxy/package.json",
  "packages/rules-engine/package.json",
  "packages/shared/package.json",
  "packages/telemetry/package.json",
  "plugins/deepseek-codex-combo/package.json",
] as const;

const releaseDirs = [
  "dist",
  "docs",
  "packages",
  "plugins/deepseek-codex-combo",
  "node_modules/@hono/node-server",
  "node_modules/hono",
  "node_modules/smol-toml",
  "node_modules/typescript",
  "node_modules/zod",
] as const;

class MissingReleaseFileError extends Error {
  readonly code = "missing_release_file";
  readonly name = "MissingReleaseFileError";

  constructor(path: string) {
    super(`missing release file: ${path}`);
  }
}

const isMissingPathError = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR");

const categoryForPath = (path: string): string => {
  if (path.startsWith("bin/")) {
    return "cli-bin";
  }
  if (path.startsWith("plugins/deepseek-codex-combo/skills/")) {
    return "plugin-skill";
  }
  if (path.startsWith("plugins/deepseek-codex-combo/hooks/")) {
    return "plugin-hook";
  }
  if (path.startsWith("plugins/deepseek-codex-combo/agents/")) {
    return "plugin-agent";
  }
  if (path.startsWith("plugins/deepseek-codex-combo/assets/")) {
    return "plugin-asset";
  }
  if (path.startsWith("plugins/deepseek-codex-combo/")) {
    return "plugin-bundle";
  }
  if (path.startsWith("docs/") || path === "README.md" || path === "CHANGELOG.md") {
    return "documentation";
  }
  if (path.endsWith("package.json") || path === "pnpm-lock.yaml") {
    return "package-file";
  }
  if (path.startsWith(".github/")) {
    return "release-workflow";
  }
  return "project-file";
};

const collectFiles = async (cwd: string, dir: string): Promise<readonly string[]> => {
  const root = join(cwd, dir);
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const child = join(dir, entry.name);
      if (shouldExcludeReleasePath(child)) {
        return [];
      }
      if (entry.isDirectory()) {
        return collectFiles(cwd, child);
      }
      if (entry.isFile()) {
        return [child];
      }
      return [];
    }),
  );
  return files.flat().sort();
};

const collectReleasePaths = async (cwd: string): Promise<readonly string[]> => {
  const dirFiles = await Promise.all(releaseDirs.map((dir) => collectFiles(cwd, dir)));
  return [
    ...new Set([...requiredTopLevelFiles, ...packageManifestFiles, ...dirFiles.flat()]),
  ].sort();
};

const manifestEntry = async (cwd: string, path: string): Promise<ReleaseFileEntry> => {
  const absolutePath = join(cwd, path);
  let fileStat: Stats;
  try {
    fileStat = await stat(absolutePath);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    throw new MissingReleaseFileError(path);
  }
  if (!fileStat.isFile()) {
    throw new MissingReleaseFileError(path);
  }
  const bytes = await readFile(absolutePath);
  return {
    bytes: fileStat.size,
    category: categoryForPath(path),
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const copyPayloadFile = async (cwd: string, outDir: string, path: string): Promise<void> => {
  const target = join(outDir, "files", path);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(cwd, path), target);
};

export const createReleasePackage = async (
  options: ReleasePackageOptions,
): Promise<ReleasePackageResult> => {
  const releaseLock = await acquirePluginDistLock(options.cwd);
  try {
    const releasePaths = await collectReleasePaths(options.cwd);
    const files = await Promise.all(releasePaths.map((path) => manifestEntry(options.cwd, path)));
    const manifest: ReleaseManifest = {
      dryRun: options.dryRun,
      files,
      generatedBy: "dcc package",
      packageName: "deepseek-codex-combo",
    };
    const checksums: ChecksumManifest = {
      files: files.map((file) => ({ path: file.path, sha256: file.sha256 })),
    };
    const manifestPath = join(options.outDir, "release-manifest.json");
    const checksumManifestPath = join(options.outDir, "checksums.manifest.json");

    await writeJson(manifestPath, manifest);
    await writeJson(checksumManifestPath, checksums);
    if (!options.dryRun) {
      await Promise.all(
        files.map((file) => copyPayloadFile(options.cwd, options.outDir, file.path)),
      );
    }

    return {
      checksumManifestPath,
      copiedFiles: options.dryRun ? 0 : files.length,
      dryRun: options.dryRun,
      fileCount: files.length,
      manifestPath,
      outDir: options.outDir,
    };
  } finally {
    await releaseLock();
  }
};

export const renderReleasePackageResult = (result: ReleasePackageResult, cwd: string): string => {
  const displayPath = (path: string): string => relative(cwd, path) || ".";
  return [
    `release package: ${result.dryRun ? "dry-run" : "written"}`,
    `release files: ${result.fileCount}`,
    `copied files: ${result.copiedFiles}`,
    `release manifest: ${displayPath(result.manifestPath)}`,
    `checksum manifest: ${displayPath(result.checksumManifestPath)}`,
  ].join("\n");
};
