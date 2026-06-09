import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const pluginDistLockPath = ".dcc/locks/plugin-dist";
const pluginDistLockWaitMs = 100;
const pluginDistLockAttempts = 300;

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export const acquirePluginDistLock = async (cwd: string): Promise<() => Promise<void>> => {
  const lockDir = join(cwd, pluginDistLockPath);
  await mkdir(dirname(lockDir), { recursive: true });
  for (let attempt = 0; attempt < pluginDistLockAttempts; attempt += 1) {
    try {
      await mkdir(lockDir);
      return () => rm(lockDir, { force: true, recursive: true });
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
      await sleep(pluginDistLockWaitMs);
    }
  }
  throw new Error("plugin_dist_lock_timeout");
};
