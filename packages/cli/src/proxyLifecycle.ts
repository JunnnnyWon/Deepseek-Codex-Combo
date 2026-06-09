import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

export interface ProxyState {
  readonly host: string;
  readonly pid: number;
  readonly port: number;
  readonly startedAt: string;
}

export type ProxyStatus =
  | { readonly kind: "running"; readonly state: ProxyState; readonly url: string }
  | { readonly kind: "stale"; readonly state: ProxyState }
  | { readonly kind: "stopped" };

export type ProxyStopResult =
  | { readonly kind: "no_state" }
  | { readonly kind: "stale_cleaned" }
  | { readonly kind: "stopped"; readonly state: ProxyState };

export type ProxyPortAvailability =
  | { readonly kind: "available" }
  | { readonly code: string; readonly kind: "unavailable" };

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isProxyState = (value: unknown): value is ProxyState => {
  if (!isRecord(value)) {
    return false;
  }
  const { host, pid, port, startedAt } = value;
  return (
    typeof host === "string" &&
    typeof pid === "number" &&
    Number.isInteger(pid) &&
    typeof port === "number" &&
    Number.isInteger(port) &&
    typeof startedAt === "string"
  );
};

export const proxyStatePath = (home: string, port: number): string =>
  join(home, ".dcc", "proxy", `port-${port}.json`);

export const writeProxyState = async (home: string, state: ProxyState): Promise<void> => {
  const path = proxyStatePath(home, state.port);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
};

export const checkProxyPortAvailable = async (
  host: string,
  port: number,
): Promise<ProxyPortAvailability> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: unknown) => {
      if (error instanceof Error && "code" in error && typeof error.code === "string") {
        resolve({ code: error.code, kind: "unavailable" });
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => {
      server.close((error) => {
        if (error === undefined) {
          resolve({ kind: "available" });
          return;
        }
        reject(error);
      });
    });
  });

export const readProxyState = async (
  home: string,
  port: number,
): Promise<ProxyState | undefined> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(proxyStatePath(home, port), "utf8"));
    return isProxyState(parsed) ? parsed : undefined;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
};

const removeProxyState = async (home: string, port: number): Promise<void> => {
  await rm(proxyStatePath(home, port), { force: true });
};

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false;
    }
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      return true;
    }
    throw error;
  }
};

export const waitForProxyHealth = async (input: {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
}): Promise<boolean> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${input.host}:${input.port}/healthz`);
      if (response.ok) {
        return true;
      }
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};

export const checkProxyStatus = async (home: string, port: number): Promise<ProxyStatus> => {
  const state = await readProxyState(home, port);
  if (state === undefined) {
    return { kind: "stopped" };
  }
  if (!processIsAlive(state.pid)) {
    await removeProxyState(home, port);
    return { kind: "stale", state };
  }
  const healthy = await waitForProxyHealth({ host: state.host, port: state.port, timeoutMs: 500 });
  if (!healthy) {
    return { kind: "stale", state };
  }
  return { kind: "running", state, url: `http://${state.host}:${state.port}` };
};

export const stopManagedProxy = async (home: string, port: number): Promise<ProxyStopResult> => {
  const state = await readProxyState(home, port);
  if (state === undefined) {
    return { kind: "no_state" };
  }
  if (!processIsAlive(state.pid)) {
    await removeProxyState(home, port);
    return { kind: "stale_cleaned" };
  }

  process.kill(state.pid, "SIGTERM");
  await removeProxyState(home, port);
  return { kind: "stopped", state };
};
