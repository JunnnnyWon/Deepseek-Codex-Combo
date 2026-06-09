import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const lockDir = join(process.cwd(), ".dcc", "locks", "plugin-dist");
const waitMs = 100;
const maxAttempts = 300;

const wait = (delayMs: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
};

export const withPluginDistLock = <T>(operation: () => T): T => {
  mkdirSync(dirname(lockDir), { recursive: true });
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      mkdirSync(lockDir);
      try {
        return operation();
      } finally {
        rmSync(lockDir, { force: true, recursive: true });
      }
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
      wait(waitMs);
    }
  }
  throw new Error("plugin_dist_lock_timeout");
};
