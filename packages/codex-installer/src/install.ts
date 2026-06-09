import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { createAutostartPlan, type ProxyAutostartMode } from "./autostart.ts";
import {
  countManagedProviderBlocks,
  removeManagedProviderBlock,
  upsertManagedModelCatalogBlock,
  upsertManagedPluginActivationBlock,
  upsertManagedPluginMcpBlock,
  upsertManagedProfileBlock,
  upsertManagedProviderBlock,
} from "./configToml.ts";
import { acquirePluginDistLock } from "./pluginDistLock.ts";

export type ProviderMode = "native" | "plugin-only" | "proxy";

export interface InstallOptions {
  readonly astGrepEnabled?: boolean;
  readonly codexAutonomous: boolean;
  readonly currentConfig?: string;
  readonly dryRun: boolean;
  readonly hashlineEnabled?: boolean;
  readonly home: string;
  readonly noTui: boolean;
  readonly providerMode: ProviderMode;
  readonly proxyAutostart: ProxyAutostartMode;
  readonly proxyHost?: string;
  readonly proxyPort?: number;
  readonly sourcePluginPath?: string;
}

export interface PluginInstallPlan {
  readonly agentPath: string;
  readonly agentPaths: readonly string[];
  readonly currentProfilePath: string;
  readonly entries: readonly string[];
  readonly flashProfilePath: string;
  readonly marketplacePath: string;
  readonly modelCatalogPath: string;
  readonly pluginCachePath: string;
  readonly profilePath: string;
}

export interface InstallPlan {
  readonly autostart: ProxyAutostartMode;
  readonly codexAutonomous: boolean;
  readonly configPath: string;
  readonly dryRun: boolean;
  readonly managedProviderBlocks: number;
  readonly mcpServers: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly pluginPlan: PluginInstallPlan;
  readonly providerMode: ProviderMode;
  readonly renderedConfig: string;
  readonly telemetry: "disabled";
}

export class UnsupportedProviderModeError extends Error {
  readonly code = "unsupported_provider_mode";
  readonly name = "UnsupportedProviderModeError";

  constructor() {
    super("native provider mode unsupported");
  }
}

const defaultProxyHost = "127.0.0.1";
const defaultProxyPort = 41473;
const pluginRootPlaceholder = "$" + "{PLUGIN_ROOT}";
const bundledAgentFiles = [
  "dcc-librarian-flash.toml",
  "dcc-planner-pro.toml",
  "dcc-verifier-pro.toml",
  "dcc-worker-flash.toml",
  "dcc-worker-pro.toml",
] as const;

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const readConfig = async (configPath: string, currentConfig?: string): Promise<string> => {
  if (currentConfig !== undefined) {
    return currentConfig;
  }

  try {
    return await readFile(configPath, "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return "";
    }
    throw error;
  }
};

const readOptionalFile = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
};

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

const createBackupName = (configPath: string, now = new Date()): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");

  return `${configPath}.dcc-backup-${stamp}`;
};

const createPluginPlan = (home: string): PluginInstallPlan => {
  const codexHome = join(home, ".codex");
  const agentPath = join(codexHome, "agents", "dcc-planner-pro.toml");
  return {
    agentPath,
    agentPaths: bundledAgentFiles.map((file) => join(codexHome, "agents", file)),
    currentProfilePath: join(codexHome, "profiles", "deepseek-current.toml"),
    entries: ["deepseek-codex-combo"],
    flashProfilePath: join(codexHome, "profiles", "deepseek-flash.toml"),
    marketplacePath: join(codexHome, "marketplaces", "deepseek-codex-combo.json"),
    modelCatalogPath: join(codexHome, "model-catalog.deepseek-codex-combo.json"),
    pluginCachePath: join(
      codexHome,
      "plugins",
      "cache",
      "deepseek-codex-combo",
      "deepseek-codex-combo",
      "0.1.0",
    ),
    profilePath: join(codexHome, "profiles", "deepseek-proxy.toml"),
  };
};

const createProfileText = (codexAutonomous: boolean): string => {
  const lines = ['model_provider = "deepseek_proxy"', 'model = "deepseek-v4-pro"'];
  if (codexAutonomous) {
    lines.push('approval_policy = "never"');
  }

  return `${lines.join("\n")}\n`;
};

const createFlashProfileText = (codexAutonomous: boolean): string => {
  const lines = ['model_provider = "deepseek_proxy"', 'model = "deepseek-v4-flash"'];
  if (codexAutonomous) {
    lines.push('approval_policy = "never"');
  }

  return `${lines.join("\n")}\n`;
};

const createCurrentProfileText = (codexAutonomous: boolean): string =>
  [
    createFlashProfileText(codexAutonomous).trimEnd(),
    'dcc_switch = "flash"',
    'dcc_route_category = "quick"',
    'dcc_route_effort = "none"',
    'dcc_agent = "dcc-worker-flash"',
    "",
  ].join("\n");

const createCodexModelCatalogText = (): string =>
  `${JSON.stringify(
    {
      models: [
        {
          slug: "deepseek-v4-flash",
          display_name: "DeepSeek V4 Flash",
          description: "DeepSeek V4 Flash via Deepseek-Codex-Combo local proxy.",
          default_reasoning_level: "low",
          supported_reasoning_levels: [
            { effort: "low", description: "Fast responses with lighter reasoning." },
            { effort: "medium", description: "Balanced reasoning for everyday coding." },
            { effort: "high", description: "Greater reasoning depth for complex coding." },
          ],
          shell_type: "shell_command",
          visibility: "list",
          supported_in_api: false,
          priority: 0,
          additional_speed_tiers: [],
          service_tiers: [],
          availability_nux: null,
          upgrade: null,
          base_instructions: "You are Codex, a coding agent running through Deepseek-Codex-Combo.",
          model_messages: {
            instructions_template:
              "You are Codex, a coding agent running through Deepseek-Codex-Combo.\n\n{{ personality }}",
            instructions_variables: {
              personality_default: "",
              personality_friendly: "",
              personality_pragmatic: "",
            },
          },
          supports_reasoning_summaries: true,
          default_reasoning_summary: "none",
          support_verbosity: true,
          default_verbosity: "low",
          apply_patch_tool_type: "freeform",
          web_search_tool_type: "text_and_image",
          truncation_policy: { mode: "tokens", limit: 10000 },
          supports_parallel_tool_calls: true,
          supports_image_detail_original: true,
          context_window: 1000000,
          max_context_window: 1000000,
          effective_context_window_percent: 95,
          experimental_supported_tools: [],
          input_modalities: ["text", "image"],
          supports_search_tool: true,
        },
        {
          slug: "deepseek-v4-pro",
          display_name: "DeepSeek V4 Pro",
          description: "DeepSeek V4 Pro via Deepseek-Codex-Combo local proxy.",
          default_reasoning_level: "high",
          supported_reasoning_levels: [
            { effort: "low", description: "Fast responses with lighter reasoning." },
            { effort: "medium", description: "Balanced reasoning for everyday coding." },
            { effort: "high", description: "Greater reasoning depth for complex coding." },
            { effort: "xhigh", description: "Extra reasoning depth for difficult work." },
          ],
          shell_type: "shell_command",
          visibility: "list",
          supported_in_api: false,
          priority: 1,
          additional_speed_tiers: [],
          service_tiers: [],
          availability_nux: null,
          upgrade: null,
          base_instructions: "You are Codex, a coding agent running through Deepseek-Codex-Combo.",
          model_messages: {
            instructions_template:
              "You are Codex, a coding agent running through Deepseek-Codex-Combo.\n\n{{ personality }}",
            instructions_variables: {
              personality_default: "",
              personality_friendly: "",
              personality_pragmatic: "",
            },
          },
          supports_reasoning_summaries: true,
          default_reasoning_summary: "none",
          support_verbosity: true,
          default_verbosity: "low",
          apply_patch_tool_type: "freeform",
          web_search_tool_type: "text_and_image",
          truncation_policy: { mode: "tokens", limit: 10000 },
          supports_parallel_tool_calls: true,
          supports_image_detail_original: true,
          context_window: 1000000,
          max_context_window: 1000000,
          effective_context_window_percent: 95,
          experimental_supported_tools: [],
          input_modalities: ["text", "image"],
          supports_search_tool: true,
        },
      ],
    },
    null,
    2,
  )}\n`;

const escapeTomlMultilineString = (value: string): string => value.replaceAll('"""', '\\"\\"\\"');

const createPlannerAgentText = async (sourcePluginPath: string): Promise<string> => {
  const instructions = await readFile(
    join(sourcePluginPath, "agents", "dcc-planner-pro.md"),
    "utf8",
  );
  return [
    'name = "dcc-planner-pro"',
    'description = "DeepSeek V4 Pro planner for decision-complete implementation plans."',
    'model = "deepseek-v4-pro"',
    'model_provider = "deepseek_proxy"',
    'model_reasoning_effort = "high"',
    `developer_instructions = """${escapeTomlMultilineString(instructions.trim())}"""`,
    "",
  ].join("\n");
};

const patchInstalledMcpManifest = async (pluginCachePath: string): Promise<void> => {
  const manifestPath = join(pluginCachePath, ".mcp.json");
  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    manifest.replaceAll(pluginRootPlaceholder, pluginCachePath),
    "utf8",
  );
};

const createMcpServerList = (options: {
  readonly astGrepEnabled: boolean;
  readonly hashlineEnabled: boolean;
}): readonly string[] => [
  "dcc-lsp",
  ...(options.astGrepEnabled ? ["dcc-ast-grep"] : []),
  ...(options.hashlineEnabled ? ["dcc-hashline"] : []),
];

const writeInstallFiles = async (plan: InstallPlan, sourcePluginPath: string): Promise<void> => {
  const existingConfig = await readOptionalFile(plan.configPath);
  const removalSnapshots = await Promise.all(
    plan.plannedFiles
      .filter((file) => file !== plan.configPath)
      .map(async (file) => ({ existed: await pathExists(file), file })),
  );

  try {
    await mkdir(dirname(plan.configPath), { recursive: true });
    if (existingConfig !== undefined && existingConfig.length > 0) {
      await writeFile(createBackupName(plan.configPath), existingConfig, "utf8");
    }
    await writeFile(plan.configPath, plan.renderedConfig, "utf8");
    await mkdir(dirname(plan.pluginPlan.pluginCachePath), { recursive: true });
    const releaseLock = await acquirePluginDistLock(dirname(dirname(sourcePluginPath)));
    try {
      await cp(sourcePluginPath, plan.pluginPlan.pluginCachePath, { force: true, recursive: true });
    } finally {
      await releaseLock();
    }
    await mkdir(dirname(plan.pluginPlan.marketplacePath), { recursive: true });
    await mkdir(dirname(plan.pluginPlan.agentPath), { recursive: true });
    await mkdir(dirname(plan.pluginPlan.profilePath), { recursive: true });
    await writeFile(plan.pluginPlan.modelCatalogPath, createCodexModelCatalogText(), "utf8");
    await writeFile(
      plan.pluginPlan.marketplacePath,
      `${JSON.stringify({ plugins: plan.pluginPlan.entries }, null, 2)}\n`,
      "utf8",
    );
    await patchInstalledMcpManifest(plan.pluginPlan.pluginCachePath);
    await writeFile(
      plan.pluginPlan.agentPath,
      await createPlannerAgentText(sourcePluginPath),
      "utf8",
    );
    await Promise.all(
      bundledAgentFiles
        .filter((file) => file !== "dcc-planner-pro.toml")
        .map((file) =>
          cp(
            join(sourcePluginPath, "agents", file),
            join(dirname(plan.pluginPlan.agentPath), file),
          ),
        ),
    );
    await writeFile(plan.pluginPlan.profilePath, createProfileText(plan.codexAutonomous), "utf8");
    await writeFile(
      plan.pluginPlan.flashProfilePath,
      createFlashProfileText(plan.codexAutonomous),
      "utf8",
    );
    await writeFile(
      plan.pluginPlan.currentProfilePath,
      createCurrentProfileText(plan.codexAutonomous),
      "utf8",
    );
  } catch (error: unknown) {
    if (existingConfig === undefined) {
      await rm(plan.configPath, { force: true });
    } else {
      await writeFile(plan.configPath, existingConfig, "utf8");
    }
    await Promise.all(
      removalSnapshots
        .filter((snapshot) => !snapshot.existed)
        .map((snapshot) => rm(snapshot.file, { force: true, recursive: true })),
    );
    throw error;
  }
};

export const createInstallPlan = async (options: InstallOptions): Promise<InstallPlan> => {
  if (options.providerMode === "native") {
    throw new UnsupportedProviderModeError();
  }

  const codexHome = join(options.home, ".codex");
  const configPath = join(codexHome, "config.toml");
  const pluginPlan = createPluginPlan(options.home);
  const autostartPlan = createAutostartPlan({ home: options.home, mode: options.proxyAutostart });
  const currentConfig = await readConfig(configPath, options.currentConfig);
  const astGrepEnabled = options.astGrepEnabled ?? true;
  const hashlineEnabled = options.hashlineEnabled ?? true;
  const providerConfig =
    options.providerMode === "proxy"
      ? upsertManagedProviderBlock(currentConfig, {
          host: options.proxyHost ?? defaultProxyHost,
          port: options.proxyPort ?? defaultProxyPort,
        })
      : removeManagedProviderBlock(currentConfig);
  const modelCatalogConfig = upsertManagedModelCatalogBlock(providerConfig, {
    path: pluginPlan.modelCatalogPath,
  });
  const pluginActivationConfig = upsertManagedPluginActivationBlock(modelCatalogConfig);
  const pluginConfig = upsertManagedPluginMcpBlock(pluginActivationConfig, {
    astGrepEnabled,
    hashlineEnabled,
  });
  const renderedConfig = upsertManagedProfileBlock(pluginConfig, {
    codexAutonomous: options.codexAutonomous,
  });
  const plannedFiles = [
    configPath,
    pluginPlan.modelCatalogPath,
    pluginPlan.pluginCachePath,
    pluginPlan.marketplacePath,
    ...pluginPlan.agentPaths,
    pluginPlan.profilePath,
    pluginPlan.flashProfilePath,
    pluginPlan.currentProfilePath,
    ...autostartPlan.plannedFiles,
  ];
  const plan: InstallPlan = {
    autostart: autostartPlan.mode,
    codexAutonomous: options.codexAutonomous,
    configPath,
    dryRun: options.dryRun,
    managedProviderBlocks: countManagedProviderBlocks(renderedConfig),
    mcpServers: createMcpServerList({ astGrepEnabled, hashlineEnabled }),
    plannedFiles,
    pluginPlan,
    providerMode: options.providerMode,
    renderedConfig,
    telemetry: "disabled",
  };

  if (!options.dryRun) {
    await writeInstallFiles(
      plan,
      options.sourcePluginPath ?? join(process.cwd(), "plugins", "deepseek-codex-combo"),
    );
  }

  return plan;
};

export const renderInstallPlanForCli = (plan: InstallPlan, home: string): string => {
  const relativeFiles = plan.plannedFiles.map((file) => relative(home, file));
  return [
    `install: ${plan.dryRun ? "dry-run" : "apply"}`,
    `provider_mode: ${plan.providerMode}`,
    `autostart: ${plan.autostart}`,
    `telemetry: ${plan.telemetry}`,
    `codex_autonomous: ${plan.codexAutonomous ? "enabled" : "disabled"}`,
    `plugin install plan: ${plan.pluginPlan.entries.length > 0 ? "present" : "absent"}`,
    ...plan.mcpServers.map((server) => `mcp server: ${server}`),
    ...relativeFiles.map((file) => `planned file: ${file}`),
    "rendered config:",
    plan.renderedConfig.trimEnd(),
    `managed_provider_blocks: ${plan.managedProviderBlocks}`,
  ].join("\n");
};
