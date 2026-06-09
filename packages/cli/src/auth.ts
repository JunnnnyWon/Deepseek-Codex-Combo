import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

export interface AuthCommandInput {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly stdin?: Readable;
  readonly stdout?: Writable;
}

export interface AuthCommandResult {
  readonly exitCode: number;
  readonly stderr?: string;
  readonly stdout?: string;
}

export interface ResolvedDeepSeekApiKey {
  readonly key: string;
  readonly source: "env" | "local-file";
}

export type ApiKeyPromptResult =
  | { readonly kind: "entered"; readonly key: string }
  | { readonly kind: "skipped" }
  | { readonly kind: "unavailable" };

const localSecretPath = (cwd: string): string => join(cwd, ".dcc", "secrets", "deepseek.env");

const readOption = (args: readonly string[], name: string): string | undefined => {
  const withEquals = args.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals !== undefined) {
    return withEquals.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const hasOption = (args: readonly string[], name: string): boolean => args.includes(name);

const readAll = async (input: Readable): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const isTtyStream = (stream: Readable | Writable): boolean => {
  if (!("isTTY" in stream)) {
    return false;
  }
  return stream.isTTY === true;
};

const normalizeKey = (value: string | undefined): string | undefined => {
  const key = value?.trim();
  return key === undefined || key.length === 0 ? undefined : key;
};

const readProcessEnv = (env: NodeJS.ProcessEnv, key: string): string | undefined => env[key];

export const readDeepSeekEnvFile = (cwd: string): string | undefined => {
  const envPath = localSecretPath(cwd);
  if (!existsSync(envPath)) {
    return undefined;
  }
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("DEEPSEEK_API_KEY=")) {
      continue;
    }
    return normalizeKey(trimmed.slice("DEEPSEEK_API_KEY=".length).replace(/^["']|["']$/g, ""));
  }
  return undefined;
};

export const resolveDeepSeekApiKey = (
  cwd: string,
  env: NodeJS.ProcessEnv,
): ResolvedDeepSeekApiKey | undefined => {
  const envKey = normalizeKey(readProcessEnv(env, "DEEPSEEK_API_KEY"));
  if (envKey !== undefined) {
    return { key: envKey, source: "env" };
  }

  const fileKey = readDeepSeekEnvFile(cwd);
  return fileKey === undefined ? undefined : { key: fileKey, source: "local-file" };
};

export const writeDeepSeekEnvFile = (cwd: string, key: string): string => {
  const envPath = localSecretPath(cwd);
  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, `DEEPSEEK_API_KEY="${key}"\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(envPath, 0o600);
  return envPath;
};

export const removeDeepSeekEnvFile = (cwd: string): boolean => {
  const envPath = localSecretPath(cwd);
  const existed = existsSync(envPath);
  rmSync(envPath, { force: true });
  return existed;
};

export const promptForDeepSeekApiKey = async (
  input: AuthCommandInput,
): Promise<ApiKeyPromptResult> => {
  const testResponse = normalizeKey(readProcessEnv(input.env, "DCC_TEST_API_KEY_PROMPT_RESPONSE"));
  if (testResponse !== undefined) {
    return { kind: "entered", key: testResponse };
  }

  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  if (!isTtyStream(stdin) || !isTtyStream(stdout)) {
    return { kind: "unavailable" };
  }

  stdout.write("DeepSeek API key is required for the isolated DCC sandbox.\n");
  stdout.write("Press Enter to skip and configure it later with `dcc auth login`.\n");
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question("DeepSeek API key: ");
    const key = normalizeKey(answer);
    return key === undefined ? { kind: "skipped" } : { kind: "entered", key };
  } finally {
    prompt.close();
  }
};

export const runAuthCommand = async (input: AuthCommandInput): Promise<AuthCommandResult> => {
  const subcommand = input.args.find((arg) => !arg.startsWith("--")) ?? "status";

  if (subcommand === "status") {
    const resolved = resolveDeepSeekApiKey(input.cwd, input.env);
    return resolved === undefined
      ? { exitCode: 1, stdout: "auth: missing\nrun: dcc auth login\n" }
      : { exitCode: 0, stdout: `auth: configured\nsource: ${resolved.source}\n` };
  }

  if (subcommand === "logout") {
    const removed = removeDeepSeekEnvFile(input.cwd);
    return {
      exitCode: 0,
      stdout: removed ? "auth: removed\n" : "auth: already missing\n",
    };
  }

  if (subcommand !== "login") {
    return { exitCode: 1, stderr: `unknown auth command: ${subcommand}\n` };
  }

  if (hasOption(input.args, "--skip")) {
    return { exitCode: 2, stdout: "auth: skipped\nrun later: dcc auth login\n" };
  }

  const explicitKey = normalizeKey(readOption(input.args, "--key"));
  const stdinKey = hasOption(input.args, "--stdin")
    ? normalizeKey(await readAll(input.stdin ?? process.stdin))
    : undefined;
  const key = explicitKey ?? stdinKey;
  if (key !== undefined) {
    writeDeepSeekEnvFile(input.cwd, key);
    return { exitCode: 0, stdout: "auth: saved\npath: .dcc/secrets/deepseek.env\n" };
  }

  const prompted = await promptForDeepSeekApiKey(input);
  if (prompted.kind === "entered") {
    writeDeepSeekEnvFile(input.cwd, prompted.key);
    return { exitCode: 0, stdout: "auth: saved\npath: .dcc/secrets/deepseek.env\n" };
  }

  if (prompted.kind === "skipped") {
    return { exitCode: 2, stdout: "auth: skipped\nrun later: dcc auth login\n" };
  }

  return {
    exitCode: 2,
    stderr:
      "auth_prompt_unavailable\nrun `dcc auth login`, export DEEPSEEK_API_KEY, or pass --skip-auth.\n",
  };
};
