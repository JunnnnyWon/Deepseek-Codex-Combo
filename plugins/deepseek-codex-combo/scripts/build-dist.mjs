#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const cliDistRoot = join(repoRoot, "dist");
const distRoot = join(pluginRoot, "dist");
const tempDistRoot = await mkdtemp(join(tmpdir(), "dcc-plugin-dist-"));
const lockDir = join(repoRoot, ".dcc", "locks", "plugin-dist");

const ignoredSegments = new Set([
  ".dcc",
  "__fixtures__",
  "__tests__",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "test",
  "tests",
]);
const dependencyIgnoredSegments = new Set([
  "__fixtures__",
  "__tests__",
  "coverage",
  "fixtures",
  "node_modules",
  "test",
  "tests",
]);
const runtimeDependencies = ["@hono/node-server", "hono", "smol-toml", "typescript", "zod"];
const ignoredFileSuffixes = [".spec.js", ".spec.ts", ".test.js", ".test.mjs", ".test.ts"];
const accidentalInstallMarker = "codex-" + "accidental-install";

const shouldCopy = (source) => {
  const relativePath = relative(repoRoot, source);
  const segments = relativePath.split(sep);
  if (segments.some((segment) => ignoredSegments.has(segment))) return false;
  if (relativePath.includes(accidentalInstallMarker)) return false;
  return !ignoredFileSuffixes.some((suffix) => relativePath.endsWith(suffix));
};

const findPackageRoot = (dependency) => {
  let current = dirname(require.resolve(dependency));
  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`package root not found: ${dependency}`);
    }
    current = parent;
  }
  return current;
};

const shouldCopyDependency = (packageRoot, source) => {
  const relativePath = relative(packageRoot, source);
  const segments = relativePath.split(sep);
  if (segments.some((segment) => dependencyIgnoredSegments.has(segment))) return false;
  return !ignoredFileSuffixes.some((suffix) => relativePath.endsWith(suffix));
};

const acquirePluginDistLock = async () => {
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
  throw new Error("plugin_dist_lock_timeout");
};

await acquirePluginDistLock();
try {
  const cliBuild = spawnSync(process.execPath, [join(repoRoot, "scripts", "build-cli.mjs")], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DCC_CLI_DIST_LOCK_HELD: "1" },
    stdio: "inherit",
  });
  if (cliBuild.status !== 0) {
    throw new Error("cli_dist_build_failed");
  }

  await rm(tempDistRoot, { force: true, recursive: true });
  await mkdir(join(tempDistRoot, "bin"), { recursive: true });
  if (existsSync(join(cliDistRoot, "bin", "dcc.mjs"))) {
    await cp(join(cliDistRoot, "bin"), join(tempDistRoot, "bin"), { recursive: true });
    await cp(join(cliDistRoot, "packages"), join(tempDistRoot, "packages"), { recursive: true });
  } else {
    await cp(join(repoRoot, "bin", "dcc.mjs"), join(tempDistRoot, "bin", "dcc.mjs"));
    await cp(join(repoRoot, "packages"), join(tempDistRoot, "packages"), {
      filter: shouldCopy,
      recursive: true,
    });
  }

  for (const dependency of runtimeDependencies) {
    const packageRoot = findPackageRoot(dependency);
    await cp(packageRoot, join(tempDistRoot, "node_modules", ...dependency.split("/")), {
      dereference: true,
      filter: (source) => shouldCopyDependency(packageRoot, source),
      recursive: true,
    });
  }

  await rm(distRoot, { force: true, recursive: true });
  await mkdir(distRoot, { recursive: true });
  await cp(tempDistRoot, distRoot, { force: true, recursive: true });
} finally {
  await rm(lockDir, { force: true, recursive: true });
  await rm(tempDistRoot, { force: true, recursive: true });
}

console.log(`built plugin runtime: ${relative(repoRoot, join(distRoot, "bin", "dcc.mjs"))}`);
