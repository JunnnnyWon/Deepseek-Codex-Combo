import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promptForDeepSeekApiKey, resolveDeepSeekApiKey, writeDeepSeekEnvFile } from "./auth.ts";
import { checkProxyStatus } from "./proxyLifecycle.ts";

export interface SandboxCommandInput {
  readonly args: readonly string[];
  readonly binPath: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface SandboxCommandResult {
  readonly exitCode: number;
  readonly stderr?: string;
  readonly stdout?: string;
}

type SandboxSubcommand = "path" | "reset" | "run" | "status";

type RoutedInitialPrompt =
  | { readonly agent: string; readonly prompt: string }
  | { readonly agent?: undefined; readonly prompt: string };

type SandboxEnvKey =
  | "DCC_AUTO_PROMPT"
  | "DCC_CODEX_PROFILE"
  | "DCC_SANDBOX_NO_DOCTOR"
  | "DCC_SANDBOX_SKIP_CODEX"
  | "DCC_PROXY_PORT"
  | "DCC_SANDBOX_HOME"
  | "DEEPSEEK_API_KEY";

const sandboxSubcommands = new Set<string>(["path", "reset", "run", "status"]);

const defaultProxyPort = 41573;

const readOption = (args: readonly string[], name: string): string | undefined => {
  const withEquals = args.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals !== undefined) {
    return withEquals.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const hasOption = (args: readonly string[], name: string): boolean => args.includes(name);

const readEnv = (env: NodeJS.ProcessEnv, key: SandboxEnvKey): string | undefined => env[key];

const isSandboxSubcommand = (value: string): value is SandboxSubcommand =>
  sandboxSubcommands.has(value);

const resolveSubcommand = (args: readonly string[]): SandboxSubcommand => {
  const candidate = args.find((arg) => !arg.startsWith("--"));
  return candidate !== undefined && isSandboxSubcommand(candidate) ? candidate : "run";
};

const resolveSandboxHome = (input: SandboxCommandInput): string =>
  readOption(input.args, "--home") ??
  readEnv(input.env, "DCC_SANDBOX_HOME") ??
  join(input.cwd, ".dcc", "sandbox-home");

const resolveProxyPort = (input: SandboxCommandInput): number =>
  Number(
    readOption(input.args, "--proxy-port") ??
      readEnv(input.env, "DCC_PROXY_PORT") ??
      defaultProxyPort,
  );

const resolveAutoPrompt = (input: SandboxCommandInput): string | undefined =>
  readOption(input.args, "--auto-prompt") ?? readEnv(input.env, "DCC_AUTO_PROMPT");

const resolveProfile = (input: SandboxCommandInput): string => {
  const explicitProfile =
    readOption(input.args, "--profile") ?? readEnv(input.env, "DCC_CODEX_PROFILE");
  if (explicitProfile !== undefined && explicitProfile.length > 0) {
    return explicitProfile;
  }
  return resolveAutoPrompt(input) === undefined ? "deepseek-proxy" : "deepseek-current";
};

const readDccAgent = (codexHome: string): string | undefined => {
  const profilePath = join(codexHome, "profiles", "deepseek-current.toml");
  if (!existsSync(profilePath)) {
    return undefined;
  }
  const lines = readFileSync(profilePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("dcc_agent = ")) {
      continue;
    }
    return trimmed.slice("dcc_agent = ".length).replace(/^["']|["']$/g, "");
  }
  return undefined;
};

const buildRoutedInitialPrompt = (codexHome: string, prompt: string): RoutedInitialPrompt => {
  const agent = readDccAgent(codexHome);
  if (agent === undefined || agent.length === 0) {
    return { prompt };
  }
  return {
    agent,
    prompt: [
      `DCC automatic agent route: delegate to ${agent} first, then continue until the request is complete.`,
      "",
      "User request:",
      prompt,
    ].join("\n"),
  };
};

const buildSandboxEnv = (
  input: SandboxCommandInput,
  home: string,
  deepSeekApiKey: string | undefined,
): NodeJS.ProcessEnv => {
  const codexHome = join(home, ".codex");
  return {
    ...input.env,
    ...(deepSeekApiKey === undefined ? {} : { DEEPSEEK_API_KEY: deepSeekApiKey }),
    CODEX_HOME: codexHome,
    DCC_SANDBOX_HOME: home,
    HOME: home,
  };
};

const runSelf = (
  input: SandboxCommandInput,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): SpawnSyncReturns<string> =>
  spawnSync(process.execPath, [input.binPath, ...args], {
    cwd: input.cwd,
    encoding: "utf8",
    env,
    timeout: 600_000,
  });

const appendProcessOutput = (lines: string[], label: string, output: SpawnSyncReturns<string>) => {
  if (output.stdout.trim().length > 0) {
    lines.push(output.stdout.trim());
  }
  if (output.stderr.trim().length > 0) {
    lines.push(`${label}: ${output.stderr.trim()}`);
  }
};

const failFromProcess = (
  label: string,
  output: SpawnSyncReturns<string>,
): SandboxCommandResult => ({
  exitCode: output.status ?? 1,
  stderr: `${label}_failed\n${output.stdout}${output.stderr}`,
});

const renderAuthSkipped = (): SandboxCommandResult => ({
  exitCode: 2,
  stdout: ["auth: skipped", "run later: dcc auth login", "or: export DEEPSEEK_API_KEY", ""].join(
    "\n",
  ),
});

const renderSandboxPaths = (home: string, profile: string, port: number): string =>
  [
    `sandbox home: ${home}`,
    `codex home: ${join(home, ".codex")}`,
    `codex profile: ${profile}`,
    `proxy port: ${port}`,
  ].join("\n");

const runSandboxPath = (input: SandboxCommandInput): SandboxCommandResult => {
  const home = resolveSandboxHome(input);
  return {
    exitCode: 0,
    stdout: `${renderSandboxPaths(home, resolveProfile(input), resolveProxyPort(input))}\n`,
  };
};

const runSandboxStatus = async (input: SandboxCommandInput): Promise<SandboxCommandResult> => {
  const home = resolveSandboxHome(input);
  const port = resolveProxyPort(input);
  const configExists = existsSync(join(home, ".codex", "config.toml"));
  const proxyStatus = await checkProxyStatus(home, port);
  const lines = [
    renderSandboxPaths(home, resolveProfile(input), port),
    `config: ${configExists ? "present" : "absent"}`,
    `proxy: ${proxyStatus.kind === "running" ? `running ${proxyStatus.url}` : "stopped"}`,
  ];
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
};

const runSandboxReset = (input: SandboxCommandInput): SandboxCommandResult => {
  const home = resolveSandboxHome(input);
  if (!hasOption(input.args, "--force")) {
    return { exitCode: 1, stderr: "sandbox_reset_requires_force\n" };
  }
  rmSync(home, { force: true, recursive: true });
  return { exitCode: 0, stdout: `sandbox reset: removed ${home}\n` };
};

const runSandboxRun = async (input: SandboxCommandInput): Promise<SandboxCommandResult> => {
  const home = resolveSandboxHome(input);
  const port = resolveProxyPort(input);
  const profile = resolveProfile(input);
  const codexHome = join(home, ".codex");
  const mockUpstream = readOption(input.args, "--mock-upstream");
  const autoPrompt = resolveAutoPrompt(input);
  const skipCodex =
    hasOption(input.args, "--skip-codex") || readEnv(input.env, "DCC_SANDBOX_SKIP_CODEX") === "1";
  const keepProxy = hasOption(input.args, "--keep-proxy");
  const noDoctor =
    hasOption(input.args, "--no-doctor") || readEnv(input.env, "DCC_SANDBOX_NO_DOCTOR") === "1";
  const noInstall = hasOption(input.args, "--no-install");
  const initialKey = resolveDeepSeekApiKey(input.cwd, input.env);
  let deepSeekApiKey = initialKey?.key;
  const lines = [renderSandboxPaths(home, profile, port)];
  let exitCode = 0;
  let stopProxyAfterRun = false;
  let initialPrompt = autoPrompt;

  if (mockUpstream === undefined && deepSeekApiKey === undefined) {
    if (hasOption(input.args, "--skip-auth")) {
      return renderAuthSkipped();
    }
    const prompted = await promptForDeepSeekApiKey(input);
    if (prompted.kind === "entered") {
      writeDeepSeekEnvFile(input.cwd, prompted.key);
      deepSeekApiKey = prompted.key;
      lines.push("auth: saved");
    } else if (prompted.kind === "skipped") {
      return renderAuthSkipped();
    } else {
      return {
        exitCode: 2,
        stderr:
          "auth_prompt_unavailable\nrun `dcc auth login`, export DEEPSEEK_API_KEY, or pass --skip-auth.\n",
      };
    }
  }

  const env = buildSandboxEnv(input, home, deepSeekApiKey);
  mkdirSync(codexHome, { recursive: true });

  if (!noInstall) {
    const install = runSelf(
      input,
      [
        "install",
        "--home",
        home,
        "--no-tui",
        "--provider-mode=proxy",
        "--proxy-port",
        String(port),
      ],
      env,
    );
    if (install.status !== 0) {
      return failFromProcess("sandbox_install", install);
    }
    appendProcessOutput(lines, "install", install);
  }

  runSelf(input, ["proxy", "stop", "--home", home, "--port", String(port)], env);
  const proxyArgs = ["proxy", "start", "--background", "--home", home, "--port", String(port)];
  const proxyStart =
    mockUpstream === undefined
      ? runSelf(input, proxyArgs, env)
      : runSelf(input, [...proxyArgs, "--mock-upstream", mockUpstream], env);
  if (proxyStart.status !== 0) {
    return failFromProcess("sandbox_proxy_start", proxyStart);
  }
  stopProxyAfterRun = true;
  appendProcessOutput(lines, "proxy", proxyStart);

  try {
    if (!noDoctor) {
      const doctor = runSelf(input, ["doctor", "--home", home, "--strict"], env);
      if (doctor.status !== 0) {
        return failFromProcess("sandbox_doctor", doctor);
      }
      appendProcessOutput(lines, "doctor", doctor);
    }

    if (autoPrompt !== undefined && autoPrompt.length > 0 && profile === "deepseek-current") {
      const route = runSelf(input, ["switch", "auto", "--home", home, "--prompt", autoPrompt], env);
      if (route.status !== 0) {
        return failFromProcess("sandbox_switch", route);
      }
      appendProcessOutput(lines, "switch", route);
      const routedPrompt = buildRoutedInitialPrompt(codexHome, autoPrompt);
      initialPrompt = routedPrompt.prompt;
      if (routedPrompt.agent !== undefined) {
        lines.push(`initial agent: ${routedPrompt.agent}`);
      }
    }

    if (!skipCodex) {
      const codexArgs =
        initialPrompt === undefined || initialPrompt.length === 0 ? [] : [initialPrompt];
      const codex = spawnSync("codex", ["--profile", profile, ...codexArgs], {
        cwd: input.cwd,
        env,
        stdio: "inherit",
      });
      exitCode = codex.status ?? 1;
    }
  } finally {
    if (stopProxyAfterRun && !keepProxy) {
      const stop = runSelf(input, ["proxy", "stop", "--home", home, "--port", String(port)], env);
      appendProcessOutput(lines, "proxy", stop);
    }
  }
  return { exitCode, stdout: `${lines.join("\n")}\n` };
};

export const runSandboxCommand = async (
  input: SandboxCommandInput,
): Promise<SandboxCommandResult> => {
  const subcommand = resolveSubcommand(input.args);
  switch (subcommand) {
    case "path":
      return runSandboxPath(input);
    case "reset":
      return runSandboxReset(input);
    case "run":
      return await runSandboxRun(input);
    case "status":
      return await runSandboxStatus(input);
  }
};
