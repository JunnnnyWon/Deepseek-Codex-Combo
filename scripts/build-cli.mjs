#!/usr/bin/env node
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import ts from "typescript";

const repoRoot = process.cwd();
const distRoot = join(repoRoot, "dist");
const packagesRoot = join(repoRoot, "packages");
const distPackagesRoot = join(distRoot, "packages");
const lockDir = join(repoRoot, ".dcc", "locks", "plugin-dist");

const excludedSuffixes = [".test.ts", ".spec.ts"];

const rewriteImportSpecifiers = (source) =>
  source
    .replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2")
    .replace(/(import\(\s*["'][^"']+)\.ts(["']\s*\))/g, "$1.js$2");

const transpileTs = (source, fileName) => {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName,
  });
  return rewriteImportSpecifiers(result.outputText);
};

const shouldCopySource = (path) => {
  if (!path.endsWith(".ts")) return false;
  return !excludedSuffixes.some((suffix) => path.endsWith(suffix));
};

const copyPackageFile = async (path) => {
  const relativePath = relative(packagesRoot, path);
  await cp(path, join(distPackagesRoot, relativePath), { force: true });
};

const buildPackageSource = async (path) => {
  const entries = await readdir(path, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        await buildPackageSource(child);
        return;
      }
      if (!entry.isFile()) {
        return;
      }
      if (shouldCopySource(child)) {
        const relativePath = relative(packagesRoot, child).replace(/\.ts$/, ".js");
        const outputPath = join(distPackagesRoot, relativePath);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, transpileTs(await readFile(child, "utf8"), child), "utf8");
        return;
      }
      if (entry.name === "package.json" || entry.name.endsWith(".json")) {
        await copyPackageFile(child);
      }
    }),
  );
};

const buildBin = async (fileName) => {
  const sourcePath = join(repoRoot, "bin", fileName);
  const outputPath = join(distRoot, "bin", fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  const source = await readFile(sourcePath, "utf8");
  await writeFile(outputPath, rewriteImportSpecifiers(source), "utf8");
  await chmod(outputPath, 0o755);
};

const acquireDistLock = async () => {
  await mkdir(dirname(lockDir), { recursive: true });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await mkdir(lockDir);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await sleep(100);
    }
  }
  throw new Error("cli_dist_lock_timeout");
};

const buildCliDist = async () => {
  await rm(distRoot, { force: true, recursive: true });
  await buildPackageSource(packagesRoot);
  await buildBin("dcc.mjs");
  await buildBin("deepseek-codex-combo.mjs");
};

if (process.env.DCC_CLI_DIST_LOCK_HELD === "1") {
  await buildCliDist();
} else {
  await acquireDistLock();
  try {
    await buildCliDist();
  } finally {
    await rm(lockDir, { force: true, recursive: true });
  }
}

console.log(`built CLI runtime: ${relative(repoRoot, join(distRoot, "bin", "dcc.mjs"))}`);
