import { type DoctorFixture, type DoctorResult, renderDoctorResult, runDoctor } from "./doctor.ts";

export type DoctorCommandInput = {
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly homeFallback?: string;
};

export type DoctorCommandResult = {
  readonly exitCode: DoctorResult["exitCode"] | 1;
  readonly home: string;
  readonly stderr?: string;
  readonly stdout?: string;
};

const readOption = (args: readonly string[], name: string): string | undefined => {
  const withEquals = args.find((option) => option.startsWith(`${name}=`));
  if (withEquals !== undefined) {
    return withEquals.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const isDoctorFixture = (value: string): value is DoctorFixture => {
  switch (value) {
    case "auth-failure":
    case "missing-dependency":
    case "model-smoke-failure":
    case "ok":
    case "proxy-down":
      return true;
    default:
      return false;
  }
};

export const runDoctorCommand = async (input: DoctorCommandInput): Promise<DoctorCommandResult> => {
  const home = readOption(input.args, "--home") ?? input.homeFallback;
  if (home === undefined || home.length === 0) {
    return { exitCode: 1, home: "", stderr: "home_required" };
  }

  const fixtureValue = readOption(input.args, "--fixture");
  if (fixtureValue !== undefined && !isDoctorFixture(fixtureValue)) {
    return { exitCode: 1, home, stderr: `invalid doctor fixture: ${fixtureValue}` };
  }
  const deepSeekBaseUrl = readOption(input.args, "--deepseek-base-url");
  const result = await runDoctor({
    env: input.env,
    ...(deepSeekBaseUrl === undefined ? {} : { deepSeekBaseUrl }),
    ...(fixtureValue === undefined ? {} : { fixture: fixtureValue }),
    home,
    live: input.args.includes("--live"),
    strict: input.args.includes("--strict"),
  });

  return { exitCode: result.exitCode, home, stdout: renderDoctorResult(result) };
};
