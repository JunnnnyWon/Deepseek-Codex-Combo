#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const vitestBin = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const hasFileParallelismFlag = args.some(
  (arg) => arg === "--fileParallelism" || arg === "--no-file-parallelism",
);

const result = spawnSync(
  vitestBin,
  ["run", ...(hasFileParallelismFlag ? [] : ["--no-file-parallelism"]), ...args],
  {
    cwd: root,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
