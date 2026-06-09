import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

export const createRedactor = (secret) => (text) => {
  if (secret.length === 0) {
    return text;
  }
  return text.split(secret).join("[REDACTED_DEEPSEEK_API_KEY]");
};

export const writeJson = (path, value) => {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const createStepRunner =
  ({ redact, repoRoot, stepsDir }) =>
  (name, command, args, options = {}) => {
    const startedAt = Date.now();
    const result = spawnSync(command, args, {
      cwd: options.cwd ?? repoRoot,
      encoding: "utf8",
      env: options.env ?? process.env,
      input: options.input,
      maxBuffer: 50 * 1024 * 1024,
      timeout: options.timeout ?? 300_000,
    });
    const artifact = {
      args,
      command,
      durationMs: Date.now() - startedAt,
      status: result.status,
      stderr: redact(result.stderr ?? ""),
      stdout: redact(result.stdout ?? ""),
    };
    writeJson(`${stepsDir}/${name}.json`, artifact);
    if (result.error !== undefined) {
      throw new Error(`${name} failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`${name} failed with status ${result.status}`);
    }
    return artifact;
  };

export const assertFile = (path) => {
  if (!existsSync(path)) {
    throw new Error(`missing file: ${path}`);
  }
};

export const assertText = (label, text, expected) => {
  if (!text.includes(expected)) {
    throw new Error(`${label} missing expected text: ${expected}`);
  }
};

export const getFreePort = async () =>
  new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("free port server did not bind");
      }
      server.close(() => resolvePort(address.port));
    });
  });
