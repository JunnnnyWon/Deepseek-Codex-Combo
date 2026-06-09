import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  type DeepSeekModelId,
  type RouteEffort,
  routePrompt,
  routeTask,
  type TaskCategory,
} from "../../model-core/src/router.ts";
import { replaceManagedBlock, validateTomlDocument } from "../../shared/src/managed-block.ts";

export type SwitchTarget = "auto" | "flash" | "pro";

export interface SwitchOptions {
  readonly dryRun: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly home: string;
  readonly prompt?: string;
  readonly target: SwitchTarget;
}

export interface SwitchPlan {
  readonly configPath: string;
  readonly configText: string;
  readonly dryRun: boolean;
  readonly effort: RouteEffort;
  readonly fallback: DeepSeekModelId;
  readonly model: DeepSeekModelId;
  readonly profilePath: string;
  readonly profileText: string;
  readonly routeCategory: TaskCategory;
  readonly target: SwitchTarget;
}

const currentProfileBlockName = "profile deepseek-current";

const readConfig = async (configPath: string): Promise<string> => {
  try {
    return await readFile(configPath, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
};

const routeForSwitch = (options: SwitchOptions) => {
  if (options.target === "auto") {
    return routePrompt({
      ...(options.env === undefined ? {} : { env: options.env }),
      prompt: options.prompt ?? "",
    });
  }

  const category: TaskCategory = options.target === "flash" ? "quick" : "plan";
  return {
    ...routeTask({ category, ...(options.env === undefined ? {} : { env: options.env }) }),
    category,
  };
};

const createConfigProfileText = (profileText: string): string =>
  [`[profiles.deepseek-current]`, profileText.trimEnd()].join("\n");

export const createSwitchPlan = async (options: SwitchOptions): Promise<SwitchPlan> => {
  const route = routeForSwitch(options);
  const configPath = join(options.home, ".codex", "config.toml");
  const profilePath = join(options.home, ".codex", "profiles", "deepseek-current.toml");
  const profileText = [
    'model_provider = "deepseek_proxy"',
    `model = "${route.model}"`,
    `dcc_switch = "${options.target}"`,
    `dcc_route_category = "${route.category}"`,
    `dcc_route_effort = "${route.effort}"`,
    `dcc_agent = "${route.agentSlug}"`,
    "",
  ].join("\n");
  const configText = replaceManagedBlock(await readConfig(configPath), {
    content: createConfigProfileText(profileText),
    name: currentProfileBlockName,
  });
  const configValidation = validateTomlDocument(configText);
  if (!configValidation.ok) {
    throw new Error(configValidation.code);
  }
  const plan: SwitchPlan = {
    configPath,
    configText,
    dryRun: options.dryRun,
    effort: route.effort,
    fallback: route.fallback,
    model: route.model,
    profilePath,
    profileText,
    routeCategory: route.category,
    target: options.target,
  };

  if (!options.dryRun) {
    await mkdir(dirname(configPath), { recursive: true });
    await mkdir(dirname(profilePath), { recursive: true });
    await writeFile(configPath, configText, "utf8");
    await writeFile(profilePath, profileText, "utf8");
  }

  return plan;
};

export const renderSwitchPlanForCli = (plan: SwitchPlan, home: string): string =>
  [
    `switch: ${plan.dryRun ? "dry-run" : "apply"}`,
    `target: ${plan.target}`,
    `category: ${plan.routeCategory}`,
    `model: ${plan.model}`,
    `fallback: ${plan.fallback}`,
    `effort: ${plan.effort}`,
    `planned file: ${relative(home, plan.configPath)}`,
    `planned file: ${relative(home, plan.profilePath)}`,
    "profile patch:",
    plan.profileText.trimEnd(),
  ].join("\n");
