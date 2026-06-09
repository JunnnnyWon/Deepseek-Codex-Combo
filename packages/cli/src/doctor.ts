import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { listCatalogModels } from "../../model-core/src/router.ts";
import { type ProxyEndpoint, runLiveDeepSeekSmoke, runProxySmoke } from "./doctorSmoke.ts";
import { checkProxyStatus } from "./proxyLifecycle.ts";

export type DoctorFixture =
  | "auth-failure"
  | "missing-dependency"
  | "model-smoke-failure"
  | "ok"
  | "proxy-down";

export interface DoctorOptions {
  readonly deepSeekBaseUrl?: string;
  readonly env: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly fixture?: DoctorFixture;
  readonly home: string;
  readonly live: boolean;
  readonly strict?: boolean;
  readonly timeoutMs?: number;
}

export interface DoctorResult {
  readonly exitCode: 0 | 1 | 2 | 3 | 4 | 5;
  readonly lines: readonly string[];
}

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
};

const readUserConfig = async (home: string): Promise<string> => {
  try {
    return await readFile(join(home, ".codex", "config.toml"), "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return "";
    }
    throw error;
  }
};

const modelLine = (): string =>
  `Models: ${listCatalogModels()
    .map((model) => model.id)
    .join(", ")}`;

const hasApiKey = (env: NodeJS.ProcessEnv): boolean => {
  const { DEEPSEEK_API_KEY } = env;
  return DEEPSEEK_API_KEY !== undefined && DEEPSEEK_API_KEY.length > 0;
};

const readApiKey = (env: NodeJS.ProcessEnv): string | undefined => {
  const { DEEPSEEK_API_KEY } = env;
  return DEEPSEEK_API_KEY === undefined || DEEPSEEK_API_KEY.length === 0
    ? undefined
    : DEEPSEEK_API_KEY;
};

const parseProxyEndpoint = (config: string): ProxyEndpoint => {
  const match = /base_url\s*=\s*"http:\/\/([^:/"]+):(\d+)\/v1"/.exec(config);
  const host = match?.[1];
  const portText = match?.[2];
  const port = portText === undefined ? Number.NaN : Number(portText);
  if (host === undefined || !Number.isInteger(port)) {
    return { host: "127.0.0.1", port: 41473 };
  }
  return { host, port };
};

const pluginRuntimePath = (home: string): string =>
  join(
    home,
    ".codex",
    "plugins",
    "cache",
    "deepseek-codex-combo",
    "deepseek-codex-combo",
    "0.1.0",
    "dist",
    "bin",
    "dcc.mjs",
  );

const profilePath = (home: string): string =>
  join(home, ".codex", "profiles", "deepseek-proxy.toml");

const commandSucceeds = (runtimePath: string, args: readonly string[]): boolean => {
  const result = spawnSync(process.execPath, [runtimePath, ...args], {
    encoding: "utf8",
    timeout: 5_000,
  });
  return result.status === 0;
};

export const runDoctor = async (options: DoctorOptions): Promise<DoctorResult> => {
  if (options.fixture === "missing-dependency") {
    return { exitCode: 2, lines: ["missing dependency: codex CLI unavailable"] };
  }

  if (options.fixture === "auth-failure") {
    return { exitCode: 3, lines: ["auth failure: DeepSeek credentials rejected"] };
  }

  if (options.live && !hasApiKey(options.env)) {
    return { exitCode: 3, lines: ["auth failure: DEEPSEEK_API_KEY required for --live"] };
  }

  if (options.fixture === "model-smoke-failure") {
    return { exitCode: 5, lines: ["model smoke failure: deepseek-v4-pro"] };
  }

  const config = await readUserConfig(options.home);
  const hasProvider = config.includes("provider deepseek_proxy");
  const hasPluginEnabled = config.includes("deepseek-codex-combo@deepseek-codex-combo");
  const hasPluginMcp = config.includes("plugin deepseek-codex-combo mcp_servers");
  const endpoint = parseProxyEndpoint(config);
  const runtimePath = pluginRuntimePath(options.home);
  const hasRuntime = await pathExists(runtimePath);
  const hasProfile = await pathExists(profilePath(options.home));
  const baseLines = [
    `Node: ${process.versions.node}`,
    modelLine(),
    "Telemetry: disabled",
    hasProvider ? "Install: provider configured" : "Install: missing user Codex config",
    hasPluginMcp ? "MCP: configured" : "MCP: missing plugin config",
  ];

  if (options.fixture === "ok") {
    return { exitCode: 0, lines: [...baseLines, "Proxy: ok", "Doctor: ok"] };
  }

  const strict = options.strict === true;
  if (strict) {
    if (!hasProvider || !hasPluginEnabled || !hasPluginMcp || !hasProfile) {
      return { exitCode: 4, lines: [...baseLines, "install failure: plugin config incomplete"] };
    }
    if (!hasRuntime) {
      return { exitCode: 4, lines: [...baseLines, "plugin runtime missing"] };
    }
    if (!commandSucceeds(runtimePath, ["lsp", "status"])) {
      return { exitCode: 4, lines: [...baseLines, "MCP: command failed"] };
    }
    if (!commandSucceeds(runtimePath, ["hooks", "session-start"])) {
      return { exitCode: 4, lines: [...baseLines, "Hooks: command failed"] };
    }
  }

  const status = await checkProxyStatus(options.home, endpoint.port);
  const proxyLines =
    status.kind === "running"
      ? [`Proxy: running http://${endpoint.host}:${endpoint.port}`]
      : ["proxy failure: local DeepSeek proxy is not reachable"];
  if (strict && status.kind !== "running") {
    return { exitCode: 4, lines: [...baseLines, ...proxyLines] };
  }

  if (options.live) {
    const apiKey = readApiKey(options.env);
    if (apiKey === undefined) {
      return { exitCode: 3, lines: ["auth failure: DEEPSEEK_API_KEY required for --live"] };
    }
    try {
      const liveLines = await runLiveDeepSeekSmoke({
        apiKey,
        ...(options.deepSeekBaseUrl === undefined ? {} : { baseUrl: options.deepSeekBaseUrl }),
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        timeoutMs: options.timeoutMs ?? 5_000,
      });
      const hasSmokeFailure = liveLines.some((line) => line.startsWith("model smoke failure"));
      if (hasSmokeFailure) {
        return { exitCode: 5, lines: [...baseLines, ...proxyLines, ...liveLines] };
      }
      if (status.kind === "running") {
        const proxySmoke = await runProxySmoke({
          apiKey,
          endpoint,
          fetchImpl: options.fetchImpl ?? fetch,
          timeoutMs: options.timeoutMs ?? 5_000,
        });
        const proxySmokeOk = proxySmoke.responsesOk && proxySmoke.cacheDiagnosticsOk;
        return {
          exitCode: proxySmokeOk ? 0 : 4,
          lines: [
            ...baseLines,
            ...proxyLines,
            ...liveLines,
            proxySmoke.responsesOk ? "Proxy: responses smoke ok" : "Proxy: responses smoke failed",
            proxySmoke.cacheDiagnosticsOk ? "Cache: diagnostics ok" : "Cache: diagnostics missing",
          ],
        };
      }
      return { exitCode: strict ? 4 : 0, lines: [...baseLines, ...proxyLines, ...liveLines] };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown live doctor failure";
      return {
        exitCode: 5,
        lines: [...baseLines, ...proxyLines, `model smoke failure: ${message}`],
      };
    }
  }

  return {
    exitCode: status.kind === "running" ? 0 : 4,
    lines: [...baseLines, ...proxyLines, ...(status.kind === "running" ? ["Doctor: ok"] : [])],
  };
};

export const renderDoctorResult = (result: DoctorResult): string => result.lines.join("\n");
