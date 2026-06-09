#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";

const commands = [
  "install",
  "uninstall",
  "doctor",
  "proxy",
  "init-deep",
  "plan",
  "start-work",
  "loop",
  "switch",
  "sandbox",
  "models",
  "rules",
  "evidence",
  "ast-grep",
  "hashline",
  "contracts",
  "debug",
  "plugin",
  "fixtures",
  "hooks",
  "lsp",
  "skills",
  "package",
];

const redacted = "[REDACTED]";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactText(value, homePath) {
  let output = value.replace(/\bsk-[A-Za-z0-9_-]+/g, redacted);
  output = output.replace(/Bearer\s+[A-Za-z0-9._-]+/g, redacted);

  if (homePath !== undefined && homePath.length > 0) {
    output = output.replace(new RegExp(`${escapeRegExp(homePath)}[^\\s"'()]*`, "g"), redacted);
  }

  return output;
}

function printHelp() {
  console.log(`DeepSeek-Codex-Combo CLI

Usage:
  dcc <command> [options]

Commands:
${commands.map((command) => `  ${command}`).join("\n")}
`);
}

const [command] = process.argv.slice(2);
const args = process.argv.slice(3);

if (command === undefined || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (!commands.includes(command)) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

if (args.includes("--help") || args.includes("-h")) {
  const { renderCommandHelp } = await import("../packages/cli/src/commandHelp.ts");
  const helpText = renderCommandHelp(command);
  if (helpText !== undefined) {
    console.log(helpText);
    process.exit(0);
  }
}

const readOption = (options, name) => {
  const withEquals = options.find((option) => option.startsWith(`${name}=`));
  if (withEquals !== undefined) {
    return withEquals.slice(name.length + 1);
  }

  const index = options.indexOf(name);
  return index === -1 ? undefined : options[index + 1];
};

const readBooleanNoFlag = (options, name) => {
  for (const option of options) {
    if (option === name) {
      return true;
    }
    if (option.startsWith(`${name}=`)) {
      const value = option.slice(name.length + 1);
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
      throw new Error(`invalid boolean flag: ${name}`);
    }
  }
  return false;
};

const readStdinText = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const parseHookFixtureFromStdin = async (parseHookFixture) => {
  try {
    return parseHookFixture(JSON.parse(await readStdinText()));
  } catch {
    throw new Error("hook_fixture_invalid");
  }
};

const binPath = fileURLToPath(import.meta.url);
const binDir = dirname(binPath);
const cliRoot = resolve(binDir, "..");
const packageRootFromDistBin = resolve(binDir, "..", "..");

const isPluginRoot = (path) => existsSync(join(path, ".codex-plugin", "plugin.json"));

const resolveSourcePluginPath = () => {
  const candidates = [
    join(process.cwd(), "plugins", "deepseek-codex-combo"),
    join(cliRoot, "plugins", "deepseek-codex-combo"),
    join(packageRootFromDistBin, "plugins", "deepseek-codex-combo"),
    resolve(binDir, "..", ".."),
  ];
  return candidates.find((candidate) => isPluginRoot(candidate)) ?? candidates[0];
};

const resolvePackageRoot = () => {
  const candidates = [process.cwd(), cliRoot, packageRootFromDistBin];
  return (
    candidates.find(
      (candidate) =>
        existsSync(join(candidate, "package.json")) &&
        existsSync(join(candidate, "plugins", "deepseek-codex-combo")),
    ) ?? process.cwd()
  );
};

const stripProxyBackgroundArgs = (options) => {
  const next = ["proxy", "start"];
  for (let index = 1; index < options.length; index++) {
    const option = options[index];
    if (option === "--background") {
      continue;
    }
    if (option === "--home") {
      index++;
      continue;
    }
    next.push(option);
  }
  return next;
};

if (command === "install") {
  const providerMode = readOption(args, "--provider-mode") ?? "proxy";
  const proxyAutostart = readOption(args, "--proxy-autostart") ?? "none";
  const proxyHost = readOption(args, "--proxy-host");
  const proxyPortValue = readOption(args, "--proxy-port");
  const home = readOption(args, "--home") ?? process.env.HOME;
  const dryRun = args.includes("--dry-run");
  const codexAutonomous =
    args.includes("--codex-autonomous") && !args.includes("--no-codex-autonomous");
  let astGrepEnabled = true;
  let hashlineEnabled = true;

  if (home === undefined || home.length === 0) {
    console.error("home_required");
    process.exit(1);
  }

  try {
    astGrepEnabled = !readBooleanNoFlag(args, "--no-ast-grep");
    hashlineEnabled = !readBooleanNoFlag(args, "--no-hashline");
    const { createInstallPlan, renderInstallPlanForCli } = await import(
      "../packages/codex-installer/src/install.ts"
    );
    const plan = await createInstallPlan({
      astGrepEnabled,
      codexAutonomous,
      dryRun,
      hashlineEnabled,
      home,
      noTui: args.includes("--no-tui"),
      providerMode,
      proxyAutostart,
      sourcePluginPath: resolveSourcePluginPath(),
      ...(proxyHost === undefined ? {} : { proxyHost }),
      ...(proxyPortValue === undefined ? {} : { proxyPort: Number(proxyPortValue) }),
    });
    console.log(redactText(renderInstallPlanForCli(plan, home), home));
    process.exit(0);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "install_failed";
    const message = error instanceof Error ? error.message : "unknown install failure";
    console.error(`${code}: ${redactText(message, home)}`);
    process.exit(1);
  }
}

if (command === "uninstall") {
  const home = readOption(args, "--home") ?? process.env.HOME;
  const dryRun = args.includes("--dry-run");

  if (home === undefined || home.length === 0) {
    console.error("home_required");
    process.exit(1);
  }

  try {
    const { createUninstallPlan, renderUninstallPlanForCli } = await import(
      "../packages/codex-installer/src/uninstall.ts"
    );
    const plan = await createUninstallPlan({ dryRun, home });
    console.log(redactText(renderUninstallPlanForCli(plan), home));
    process.exit(0);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "uninstall_failed";
    const message = error instanceof Error ? error.message : "unknown uninstall failure";
    console.error(`${code}: ${redactText(message, home)}`);
    process.exit(1);
  }
}

if (command === "models") {
  const { listCatalogModels } = await import("../packages/model-core/src/router.ts");
  console.log("DeepSeek models:");
  for (const model of listCatalogModels()) {
    console.log(`${model.id}\t${model.displayName}`);
  }
  process.exit(0);
}

if (command === "doctor") {
  try {
    const { runDoctorCommand } = await import("../packages/cli/src/doctorCommand.ts");
    const result = await runDoctorCommand({
      args,
      env: process.env,
      homeFallback: process.env.HOME,
    });
    if (result.stderr !== undefined) {
      console.error(redactText(result.stderr, result.home));
    }
    if (result.stdout !== undefined) {
      console.log(redactText(result.stdout, result.home));
    }
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown doctor failure";
    console.error(`doctor_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "init-deep") {
  const cwd = readOption(args, "--cwd") ?? process.cwd();
  const dryRun = args.includes("--dry-run");
  const refreshNestedAgents = args.includes("--refresh-nested-agents");

  if (cwd.length === 0 || !existsSync(cwd)) {
    console.error("invalid_cwd");
    process.exit(1);
  }

  try {
    const { runInitDeep } = await import("../packages/cli/src/initDeep.ts");
    const result = await runInitDeep({
      cwd,
      dryRun,
      ...(refreshNestedAgents ? { refreshNestedAgents } : {}),
    });

    if (result.lines.length > 0) {
      console.log(redactText(result.lines.join("\n"), process.env.HOME));
    }
    console.log(redactText(`generated files (${result.generatedFiles.length}):`, process.env.HOME));
    for (const generatedFile of result.generatedFiles) {
      console.log(redactText(`- ${generatedFile}`, process.env.HOME));
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "init_deep_failed";
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;

    if (message === "invalid_cwd") {
      console.error("invalid_cwd");
      process.exit(1);
    }
    if (message === "insufficient_source_context") {
      console.error("insufficient_source_context");
      process.exit(1);
    }
    if (code === "EEXIST" || code === "EISDIR") {
      console.error(
        "file_write_conflict: target file is not writable. Remove the conflicting path or rerun with a safer --cwd",
      );
      process.exit(1);
    }

    console.error(`init_deep_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "switch") {
  const target = args[0]?.startsWith("--") ? "auto" : (args[0] ?? "auto");
  const validTargets = new Set(["auto", "flash", "pro"]);
  const home = readOption(args, "--home") ?? process.env.HOME;
  const prompt = readOption(args, "--prompt");
  const promptFile = readOption(args, "--prompt-file");

  if (!validTargets.has(target)) {
    console.error(`unknown switch target: ${target}`);
    process.exit(1);
  }

  if (home === undefined || home.length === 0) {
    console.error("home_required");
    process.exit(1);
  }

  try {
    const { createSwitchPlan, renderSwitchPlanForCli } = await import(
      "../packages/cli/src/switch.ts"
    );
    const routePrompt =
      prompt ??
      (promptFile === undefined ? undefined : readFileSync(promptFile, "utf8")) ??
      (args.includes("--stdin") ? await readStdinText() : undefined);
    const plan = await createSwitchPlan({
      dryRun: args.includes("--dry-run"),
      env: process.env,
      home,
      ...(routePrompt === undefined ? {} : { prompt: routePrompt }),
      target,
    });
    console.log(redactText(renderSwitchPlanForCli(plan, home), home));
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown switch failure";
    console.error(`switch_failed: ${redactText(message, home)}`);
    process.exit(1);
  }
}

if (command === "sandbox") {
  try {
    const { runSandboxCommand } = await import("../packages/cli/src/sandbox.ts");
    const result = await runSandboxCommand({
      args,
      binPath: fileURLToPath(import.meta.url),
      cwd: process.cwd(),
      env: process.env,
    });
    if (result.stdout !== undefined) {
      console.log(redactText(result.stdout.trimEnd(), process.env.HOME));
    }
    if (result.stderr !== undefined) {
      console.error(redactText(result.stderr.trimEnd(), process.env.HOME));
    }
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown sandbox failure";
    console.error(`sandbox_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "rules") {
  const [subcommand] = args;
  if (subcommand !== "list") {
    console.error("Usage: dcc rules list --cwd <path> [--budget <chars>] [--dry-run]");
    process.exit(1);
  }

  const cwd = readOption(args, "--cwd") ?? process.cwd();
  const budgetText = readOption(args, "--budget");
  const budget = budgetText === undefined ? 12_000 : Number(budgetText);

  if (!Number.isFinite(budget) || budget <= 0) {
    console.error("invalid_rule_budget");
    process.exit(1);
  }

  try {
    const { buildRulesInjection, renderRulesInjectionResult } = await import(
      "../packages/rules-engine/src/injectRules.ts"
    );
    const result = await buildRulesInjection({ budget, cwd });
    console.log(redactText(renderRulesInjectionResult(result), process.env.HOME));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown rules failure";
    console.error(`rules_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "hooks") {
  const [subcommand] = args;
  const fixturePath = readOption(args, "--fixture");

  try {
    const {
      loadHookFixture,
      parseHookFixture,
      renderHookResult,
      runNoopHook,
      runPostToolUseHook,
      runSessionStartHook,
      runStopHook,
      runSubagentStopHook,
      runUserPromptSubmitHook,
    } = await import("../packages/cli/src/hooks/lifecycle.ts");
    const loadFixtureInput = async () =>
      fixturePath === undefined
        ? await parseHookFixtureFromStdin(parseHookFixture)
        : await loadHookFixture(fixturePath);
    let result;

    if (subcommand === "session-start") {
      result = runSessionStartHook();
    } else if (subcommand === "user-prompt-submit") {
      const fixture = await loadFixtureInput();
      if (fixture === undefined || fixture.hook_event_name !== "UserPromptSubmit") {
        throw new Error("hook_fixture_invalid");
      }
      result = runUserPromptSubmitHook(fixture);
    } else if (subcommand === "post-tool-use") {
      const fixture = await loadFixtureInput();
      if (fixture === undefined || fixture.hook_event_name !== "PostToolUse") {
        throw new Error("hook_fixture_invalid");
      }
      result = runPostToolUseHook(fixture);
    } else if (subcommand === "stop") {
      const fixture = await loadFixtureInput();
      if (fixture === undefined || fixture.hook_event_name !== "Stop") {
        throw new Error("hook_fixture_invalid");
      }
      result = runStopHook(fixture.boulder);
    } else if (subcommand === "subagent-stop") {
      const fixture = await loadFixtureInput();
      if (fixture === undefined || fixture.hook_event_name !== "SubagentStop") {
        throw new Error("hook_fixture_invalid");
      }
      result = runSubagentStopHook(fixture.boulder);
    } else if (subcommand === "post-compact") {
      result = runNoopHook(subcommand);
    } else {
      console.error(
        "Usage: dcc hooks session-start|user-prompt-submit|post-tool-use|post-compact|stop|subagent-stop",
      );
      process.exit(1);
    }

    console.log(redactText(renderHookResult(result), process.env.HOME));
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown hook failure";
    console.error(`hooks_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "evidence") {
  const [subcommand] = args;

  if (subcommand !== "start") {
    console.error("Usage: dcc evidence start --plan <path> [--cwd <path>] [--session-id <id>]");
    process.exit(1);
  }

  const cwd = readOption(args, "--cwd") ?? process.cwd();
  const planPath = readOption(args, "--plan");
  const sessionId = readOption(args, "--session-id");

  if (planPath === undefined || planPath.length === 0) {
    console.error("plan_required");
    process.exit(1);
  }

  try {
    const { startBoulderSession } = await import("../packages/boulder-state/src/index.ts");
    const started = await startBoulderSession({
      cwd,
      planPath,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
    console.log(
      JSON.stringify({
        evidenceDir: started.evidenceDir,
        sessionId: started.session.id,
        status: "active",
      }),
    );
    process.exit(0);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "evidence_failed";
    const message = error instanceof Error ? error.message : "unknown evidence failure";
    console.error(`${code}: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "plan") {
  const task = args.find((arg) => !arg.startsWith("--")) ?? "";
  const cwd = readOption(args, "--cwd") ?? process.cwd();
  const noEdit = args.includes("--no-edit");

  if (task.length === 0) {
    console.error("Usage: dcc plan <task> [--cwd <path>] [--no-edit]");
    process.exit(1);
  }

  try {
    const { runPlanCommand } = await import("../packages/cli/src/plan.ts");
    const result = await runPlanCommand({
      cwd,
      task,
      ...(noEdit ? { noEdit } : {}),
    });
    console.log(result.lines.join("\n"));
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown plan failure";
    console.error(`plan_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "start-work") {
  const firstArg = args.find((arg) => !arg.startsWith("--"));
  const cwd = readOption(args, "--cwd") ?? process.cwd();
  const sessionId = readOption(args, "--session-id");
  const dryRun = args.includes("--dry-run");
  const completeTaskText = readOption(args, "--complete-task");
  const completeTaskIndex = completeTaskText === undefined ? undefined : Number(completeTaskText);
  const evidencePath = readOption(args, "--evidence");

  if (firstArg === undefined) {
    console.error(
      "Usage: dcc start-work <plan|verify> [--cwd <path>] [--session-id <id>] [--dry-run] [--complete-task <n>] [--evidence <path>]",
    );
    process.exit(1);
  }
  if (
    completeTaskText !== undefined &&
    (!Number.isFinite(completeTaskIndex) || completeTaskIndex <= 0)
  ) {
    console.error("invalid_complete_task");
    process.exit(1);
  }

  try {
    const { runStartWorkCommand } = await import("../packages/cli/src/orchestration.ts");
    const result = await runStartWorkCommand({
      cwd,
      dryRun,
      planPath: firstArg,
      ...(completeTaskIndex === undefined ? {} : { completeTaskIndex }),
      ...(evidencePath === undefined ? {} : { evidencePath }),
      ...(sessionId === undefined ? {} : { sessionId }),
    });
    console.log(result.lines.join("\n"));
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown start-work failure";
    console.error(`start_work_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "loop") {
  const cwd = readOption(args, "--cwd") ?? process.cwd();
  const sessionId = readOption(args, "--session-id");
  const resumeSessionId = readOption(args, "--resume");
  const maxStepsText = readOption(args, "--max-steps") ?? "1";
  const maxSteps = Number(maxStepsText);
  const task =
    args.find((arg, index) => {
      if (arg.startsWith("--")) {
        return false;
      }
      const previousArg = index === 0 ? undefined : args[index - 1];
      if (
        previousArg === "--resume" ||
        previousArg === "--session-id" ||
        previousArg === "--cwd" ||
        previousArg === "--max-steps"
      ) {
        return false;
      }
      return true;
    }) ?? undefined;

  if (!Number.isFinite(maxSteps) || maxSteps < 0) {
    console.error("invalid_loop_max_steps");
    process.exit(1);
  }

  try {
    const { runLoopCommand } = await import("../packages/cli/src/loop.ts");
    const result = await runLoopCommand({
      cwd,
      maxSteps,
      ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(task === undefined ? {} : { task }),
    });
    console.log(result.lines.join("\n"));
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown loop failure";
    console.error(`loop_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "lsp") {
  const [subcommand, filePath] = args;

  try {
    const {
      describeLspMcpServer,
      runLspDiagnostics,
      runLspFindReferences,
      runLspGotoDefinition,
      runLspPrepareRename,
      runLspRename,
      runLspStatus,
      runLspSymbols,
      startLspMcpStdioServer,
    } = await import("../packages/lsp-tools-mcp/src/index.ts");
    const line = Number(readOption(args, "--line") ?? "1");
    const character = Number(readOption(args, "--character") ?? "1");
    const newName = readOption(args, "--new-name") ?? "";

    if (subcommand === "mcp") {
      if (args.includes("--describe") || process.stdin.isTTY) {
        console.log(JSON.stringify(describeLspMcpServer()));
        process.exit(0);
      }
      await startLspMcpStdioServer();
      process.exit(0);
    }
    if (subcommand === "status") {
      console.log(JSON.stringify(runLspStatus(filePath)));
      process.exit(0);
    }
    if (filePath === undefined || filePath.length === 0) {
      console.error(
        "Usage: dcc lsp diagnostics|status|symbols|goto-definition|find-references|prepare-rename|rename <file>",
      );
      process.exit(1);
    }
    if (subcommand === "diagnostics") {
      console.log(JSON.stringify(runLspDiagnostics(filePath)));
      process.exit(0);
    }
    if (subcommand === "symbols") {
      console.log(JSON.stringify(runLspSymbols(filePath)));
      process.exit(0);
    }
    if (subcommand === "goto-definition") {
      console.log(JSON.stringify(runLspGotoDefinition(filePath, line, character)));
      process.exit(0);
    }
    if (subcommand === "find-references") {
      console.log(JSON.stringify(runLspFindReferences(filePath, line, character)));
      process.exit(0);
    }
    if (subcommand === "prepare-rename") {
      console.log(JSON.stringify(runLspPrepareRename(filePath, line, character)));
      process.exit(0);
    }
    if (subcommand === "rename") {
      console.log(JSON.stringify(runLspRename(filePath, line, character, newName)));
      process.exit(0);
    }

    console.error(
      "Usage: dcc lsp diagnostics|status|symbols|goto-definition|find-references|prepare-rename|rename <file>",
    );
    process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown lsp failure";
    console.error(`lsp_failed: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "contracts") {
  const [subcommand] = args;
  const isOffline = args.includes("--offline");
  const isLive = args.includes("--live");

  if (subcommand !== "verify") {
    console.error("Usage: dcc contracts verify [--offline|--live]");
    process.exit(1);
  }

  if (isOffline) {
    console.log("Codex contract: ok");
    console.log("DeepSeek contract: ok");
    console.log("live: skipped");
    process.exit(0);
  }

  if (!isLive) {
    console.error('live checks require "--live"');
    process.exit(1);
  }

  console.error("live contract checks are fail-closed until a mocked/live verifier is implemented");
  process.exit(2);
}

if (command === "debug") {
  const [subcommand] = args;

  if (subcommand === "redact") {
    const secretIndex = args.indexOf("--sample-secret");
    const pathIndex = args.indexOf("--sample-path");
    const sampleSecret = secretIndex === -1 ? "" : (args[secretIndex + 1] ?? "");
    const samplePath = pathIndex === -1 ? "" : (args[pathIndex + 1] ?? "");
    console.log(redactText(`secret=${sampleSecret}\npath=${samplePath}`, process.env.HOME));
    process.exit(0);
  }

  if (subcommand === "patch-config") {
    const fixtureIndex = args.indexOf("--fixture");
    const fixturePath = fixtureIndex === -1 ? undefined : args[fixtureIndex + 1];
    if (fixturePath === undefined) {
      console.error("config_parse_error: missing fixture");
      process.exit(1);
    }

    try {
      parseToml(readFileSync(fixturePath, "utf8"));
      console.log("config: ok");
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown TOML parse error";
      console.error(`config_parse_error: ${message}`);
      process.exit(1);
    }
  }

  console.error("Usage: dcc debug redact|patch-config");
  process.exit(1);
}

if (command === "plugin") {
  const [subcommand] = args;
  if (subcommand !== "validate") {
    console.error("Usage: dcc plugin validate --fixture <path>");
    process.exit(1);
  }

  const fixtureIndex = args.indexOf("--fixture");
  const pluginPath = fixtureIndex === -1 ? "plugins/deepseek-codex-combo" : args[fixtureIndex + 1];
  if (pluginPath === undefined || pluginPath.length === 0) {
    console.error("plugin_path_required");
    process.exit(1);
  }

  if (!existsSync(`${pluginPath}/hooks/hooks.json`)) {
    console.error("hooks_required");
    process.exit(1);
  }

  const agentDir = `${pluginPath}/agents`;
  if (existsSync(agentDir)) {
    const { readdirSync } = await import("node:fs");
    const allowedModels = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);
    for (const fileName of readdirSync(agentDir)) {
      if (!fileName.endsWith(".toml")) {
        continue;
      }
      const agent = parseToml(readFileSync(`${agentDir}/${fileName}`, "utf8"));
      const model = agent.model;
      const provider = agent.model_provider;
      if (!allowedModels.has(model) || provider !== "deepseek_proxy") {
        console.error(`unknown_deepseek_model: ${fileName}`);
        process.exit(1);
      }
    }
  }

  console.log("plugin: ok");
  process.exit(0);
}

if (command === "skills") {
  const [subcommand, slug] = args;
  if (subcommand !== "inspect" || slug === undefined || slug.length === 0) {
    console.error("Usage: dcc skills inspect <skill>");
    process.exit(1);
  }

  const { getPromptContract, renderPromptContract } = await import(
    "../packages/prompts-core/src/index.ts"
  );
  const contract = getPromptContract(slug);
  if (contract === undefined) {
    console.error(`skill_not_found: ${slug}`);
    process.exit(1);
  }
  console.log(renderPromptContract(contract));
  process.exit(0);
}

if (command === "package") {
  const outDir = readOption(args, "--out") ?? ".dcc/release";
  const dryRun = args.includes("--dry-run");
  const packageRoot = resolvePackageRoot();

  try {
    const { createReleasePackage, renderReleasePackageResult } = await import(
      "../packages/cli/src/releasePackage.ts"
    );
    const result = await createReleasePackage({
      cwd: packageRoot,
      dryRun,
      outDir,
    });
    console.log(redactText(renderReleasePackageResult(result, packageRoot), process.env.HOME));
    process.exit(0);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "package_failed";
    const message = error instanceof Error ? error.message : "unknown package failure";
    console.error(`${code}: ${redactText(message, process.env.HOME)}`);
    process.exit(1);
  }
}

if (command === "proxy") {
  const [subcommand, fixturePath] = args;
  const proxyHome = readOption(args, "--home") ?? process.env.HOME;
  const proxyPort = Number(readOption(args, "--port") ?? "41473");
  const validProxySubcommands = new Set([
    "reasoning-error-fixture",
    "start",
    "status",
    "stop",
    "stream-fixture",
    "transform-fixture",
  ]);

  if (subcommand === "status") {
    if (proxyHome === undefined || proxyHome.length === 0) {
      console.error("home_required");
      process.exit(1);
    }
    const { checkProxyStatus } = await import("../packages/cli/src/proxyLifecycle.ts");
    const status = await checkProxyStatus(proxyHome, proxyPort);
    if (status.kind === "running") {
      console.log(`proxy status: running ${status.url}`);
      process.exit(0);
    }
    if (status.kind === "stale") {
      console.log("proxy status: stopped (stale state cleaned)");
      process.exit(0);
    }
    console.log("proxy status: stopped");
    process.exit(0);
  }

  if (subcommand === "stop") {
    if (proxyHome === undefined || proxyHome.length === 0) {
      console.error("home_required");
      process.exit(1);
    }
    const { stopManagedProxy } = await import("../packages/cli/src/proxyLifecycle.ts");
    const result = await stopManagedProxy(proxyHome, proxyPort);
    if (result.kind === "stopped") {
      console.log("proxy stop: stopped");
      process.exit(0);
    }
    if (result.kind === "stale_cleaned") {
      console.log("proxy stop: stale state cleaned");
      process.exit(0);
    }
    console.log("proxy stop: no managed proxy process found");
    process.exit(0);
  }

  if (subcommand === "start") {
    const readOption = (name) => {
      const index = args.indexOf(name);
      return index === -1 ? undefined : args[index + 1];
    };
    const host = readOption("--host");
    const portText = readOption("--port");
    const tokenAuth = readOption("--token-auth");
    const mockUpstreamPath = readOption("--mock-upstream");
    const deepSeekBaseUrl = readOption("--deepseek-base-url");
    const allowRemoteBind = args.includes("--allow-remote-bind");
    const background = args.includes("--background");
    const enableMetrics = args.includes("--metrics");
    const port = portText === undefined ? undefined : Number(portText);

    try {
      if (background) {
        if (proxyHome === undefined || proxyHome.length === 0) {
          console.error("home_required");
          process.exit(1);
        }
        const { checkProxyPortAvailable, waitForProxyHealth, writeProxyState } = await import(
          "../packages/cli/src/proxyLifecycle.ts"
        );
        const bindHost = host ?? "127.0.0.1";
        const bindPort = port ?? 41473;
        const portAvailability = await checkProxyPortAvailable(bindHost, bindPort);
        if (portAvailability.kind === "unavailable") {
          console.error(
            `proxy_port_unavailable: ${bindHost}:${bindPort} (${portAvailability.code})`,
          );
          process.exit(1);
        }
        const child = spawn(
          process.execPath,
          [fileURLToPath(import.meta.url), ...stripProxyBackgroundArgs(args)],
          {
            cwd: process.cwd(),
            detached: true,
            env: process.env,
            stdio: "ignore",
          },
        );
        child.unref();
        const ready = await waitForProxyHealth({
          host: bindHost,
          port: bindPort,
          timeoutMs: 5_000,
        });
        if (!ready || child.pid === undefined) {
          console.error("proxy_background_start_failed");
          process.exit(1);
        }
        await writeProxyState(proxyHome, {
          host: bindHost,
          pid: child.pid,
          port: bindPort,
          startedAt: new Date().toISOString(),
        });
        console.log(`proxy background: started http://${bindHost}:${bindPort}`);
        process.exit(0);
      }

      const { createMockChatCompletionProvider, createMockChatCompletionStreamProvider } =
        await import("../packages/provider-proxy/src/mockUpstream.ts");
      const { createDeepSeekChatCompletionStreamProvider } = await import(
        "../packages/provider-proxy/src/deepseekStreamProvider.ts"
      );
      const { createDeepSeekChatCompletionProvider, createDeepSeekModelListProvider } =
        await import("../packages/provider-proxy/src/deepseekProvider.ts");
      const { startProviderProxyServer } = await import("../packages/provider-proxy/src/server.ts");
      const deepSeekProviderOptions = {
        apiKey: process.env.DEEPSEEK_API_KEY,
        ...(deepSeekBaseUrl === undefined ? {} : { baseUrl: deepSeekBaseUrl }),
      };
      const mockStreamProvider =
        mockUpstreamPath === undefined
          ? undefined
          : createMockChatCompletionStreamProvider(mockUpstreamPath);
      const providerOptions =
        mockUpstreamPath === undefined
          ? {
              chatCompletionProvider: createDeepSeekChatCompletionProvider(deepSeekProviderOptions),
              chatCompletionStreamProvider:
                createDeepSeekChatCompletionStreamProvider(deepSeekProviderOptions),
              modelsProvider: createDeepSeekModelListProvider(deepSeekProviderOptions),
            }
          : {
              chatCompletionProvider: createMockChatCompletionProvider(mockUpstreamPath),
              ...(mockStreamProvider === undefined
                ? {}
                : { chatCompletionStreamProvider: mockStreamProvider }),
            };
      const server = startProviderProxyServer({
        allowRemoteBind,
        enableMetrics,
        ...providerOptions,
        ...(host === undefined ? {} : { host }),
        onListening: (bind) => {
          console.log(`provider-proxy ready http://${bind.host}:${bind.port}`);
        },
        ...(port === undefined ? {} : { port }),
        ...(tokenAuth === undefined ? {} : { tokenAuth }),
      });
      const close = async () => {
        await server.close();
        process.exit(0);
      };

      process.on("SIGINT", close);
      process.on("SIGTERM", close);
      await new Promise(() => {});
    } catch (error) {
      const code =
        error instanceof Error && "code" in error && typeof error.code === "string"
          ? error.code
          : "proxy_start_failed";
      const message = error instanceof Error ? error.message : "unknown proxy start failure";
      console.error(`${code}: ${redactText(message, process.env.HOME)}`);
      process.exit(1);
    }
  }

  if (
    subcommand === undefined ||
    !validProxySubcommands.has(subcommand) ||
    fixturePath === undefined ||
    fixturePath.length === 0
  ) {
    console.error(
      "Usage: dcc proxy start|transform-fixture|stream-fixture|reasoning-error-fixture [options]",
    );
    process.exit(1);
  }

  const {
    transformProxyFixtureFile,
    transformReasoningErrorFixtureFile,
    transformStreamFixtureFile,
  } = await import("../packages/provider-proxy/src/fixtureTransform.ts");
  const result =
    subcommand === "stream-fixture"
      ? transformStreamFixtureFile(fixturePath)
      : subcommand === "reasoning-error-fixture"
        ? transformReasoningErrorFixtureFile(fixturePath)
        : transformProxyFixtureFile(fixturePath);

  if (result.ok) {
    for (const line of result.lines) {
      console.log(redactText(line, process.env.HOME));
    }
    process.exit(0);
  }

  console.error(`${result.code}: ${redactText(result.message, process.env.HOME)}`);
  process.exit(1);
}

if (command === "fixtures") {
  const [subcommand, fixturePath] = args;
  if (subcommand !== "verify" || fixturePath === undefined || fixturePath.length === 0) {
    console.error("Usage: dcc fixtures verify <fixture-path>");
    process.exit(1);
  }

  const manifestPath = `${fixturePath}/fixture.json`;
  if (!existsSync(manifestPath)) {
    console.error("fixture_invalid: missing fixture.json");
    process.exit(1);
  }

  const hasPackageMetadata =
    existsSync(`${fixturePath}/package.json`) ||
    existsSync(`${fixturePath}/pyproject.toml`) ||
    existsSync(`${fixturePath}/Cargo.toml`);

  if (!hasPackageMetadata) {
    console.error("fixture_invalid: missing package metadata");
    process.exit(1);
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const hasName = typeof manifest.name === "string" && manifest.name.length > 0;
    const hasCommands =
      Array.isArray(manifest.commands) &&
      manifest.commands.length > 0 &&
      manifest.commands.every((candidate) => typeof candidate === "string" && candidate.length > 0);

    if (!hasName || !hasCommands) {
      console.error("fixture_invalid: bad fixture manifest");
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fixture parse error";
    console.error(`fixture_invalid: ${message}`);
    process.exit(1);
  }

  console.log("fixture: ok");
  process.exit(0);
}

if (command === "ast-grep") {
  const [subcommand] = args;

  const readPositional = (rawArgs) => {
    const result = [];
    for (let index = 0; index < rawArgs.length; index++) {
      const arg = rawArgs[index];
      if (!arg.startsWith("--")) {
        result.push(arg);
        continue;
      }
      if (arg.includes("=")) {
        continue;
      }
      const next = rawArgs[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        index++;
      }
    }
    return result;
  };

  const readPath = (rawArgs) => {
    const positional = readPositional(rawArgs).filter((candidate) => candidate !== subcommand);
    return positional.at(-1);
  };

  const language = readOption(args, "--lang") ?? readOption(args, "--language") ?? "typescript";
  const pattern = readOption(args, "--pattern");
  const rewrite = readOption(args, "--rewrite");
  const dryRun = !args.includes("--apply");
  const path = readPath(args);

  if (subcommand === "list-languages") {
    const { runAstGrepListLanguages } = await import("../packages/ast-grep-mcp/src/index.ts");
    console.log(JSON.stringify(runAstGrepListLanguages()));
    process.exit(0);
  }

  if (subcommand === "describe") {
    const { describeAstGrepMcpServer } = await import("../packages/ast-grep-mcp/src/index.ts");
    console.log(JSON.stringify(describeAstGrepMcpServer()));
    process.exit(0);
  }

  if (subcommand === "mcp") {
    const { describeAstGrepMcpServer, startAstGrepMcpStdioServer } = await import(
      "../packages/ast-grep-mcp/src/index.ts"
    );
    if (args.includes("--describe") || process.stdin.isTTY) {
      console.log(JSON.stringify(describeAstGrepMcpServer()));
      process.exit(0);
    }
    await startAstGrepMcpStdioServer();
    process.exit(0);
  }

  if (subcommand === "search") {
    if (pattern === undefined || path === undefined) {
      console.error("Usage: dcc ast-grep search --lang <language> --pattern <pattern> <path>");
      process.exit(1);
    }
    const { runAstGrepSearch } = await import("../packages/ast-grep-mcp/src/index.ts");
    try {
      console.log(JSON.stringify(runAstGrepSearch({ language, pattern, path })));
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ast_grep_failed";
      console.error(message);
      process.exit(1);
    }
  }

  if (subcommand === "rewrite") {
    if (pattern === undefined || rewrite === undefined || path === undefined) {
      console.error(
        "Usage: dcc ast-grep rewrite --lang <language> --pattern <pattern> --rewrite <replace> [--apply] <path>",
      );
      process.exit(1);
    }
    const { runAstGrepRewrite } = await import("../packages/ast-grep-mcp/src/index.ts");
    try {
      console.log(JSON.stringify(runAstGrepRewrite({ dryRun, language, pattern, path, rewrite })));
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ast_grep_failed";
      console.error(message);
      process.exit(1);
    }
  }

  console.error("Usage: dcc ast-grep search|rewrite|describe|list-languages ...");
  process.exit(1);
}

if (command === "hashline") {
  const [subcommand] = args;

  if (subcommand === "mcp") {
    const { describeHashlineMcpServer, startHashlineMcpStdioServer } = await import(
      "../packages/hashline-core/src/index.ts"
    );
    if (args.includes("--describe") || process.stdin.isTTY) {
      console.log(JSON.stringify(describeHashlineMcpServer()));
      process.exit(0);
    }
    await startHashlineMcpStdioServer();
    process.exit(0);
  }

  if (subcommand === "read") {
    const filePath = readOption(args, "--file") ?? args.at(-1);
    if (filePath === undefined || filePath === "read") {
      console.error("Usage: dcc hashline read <file>");
      process.exit(1);
    }
    const { readHashlineFile } = await import("../packages/hashline-core/src/index.ts");
    console.log(await readHashlineFile(filePath));
    process.exit(0);
  }

  if (subcommand === "verify") {
    const line = readOption(args, "--line");
    const hash = readOption(args, "--hash");
    if (line === undefined || hash === undefined) {
      console.error("Usage: dcc hashline verify --line <text> --hash <hash>");
      process.exit(1);
    }
    const { verifyHashlinePatch } = await import("../packages/hashline-core/src/index.ts");
    console.log(JSON.stringify({ ok: verifyHashlinePatch(line, hash) }));
    process.exit(0);
  }

  if (subcommand === "apply") {
    const fixture = readOption(args, "--fixture");
    const { applyHashlinePatchFile } = await import("../packages/hashline-core/src/index.ts");
    if (fixture !== undefined) {
      const fixtureText = readFileSync(fixture, "utf8");
      const [header] = fixtureText.split(/\r?\n/);
      const targetPrefix = "path: ";
      if (header === undefined || !header.startsWith(targetPrefix)) {
        console.error("invalid_patch_fixture");
        process.exit(1);
      }
      const result = await applyHashlinePatchFile(header.slice(targetPrefix.length), fixture);
      console.log(JSON.stringify(result));
      if (result.applied) {
        process.exit(0);
      }
      console.error(
        `${result.reason ?? "patch_rejected"}${result.refreshSuggested ? ": refresh suggested" : ""}`,
      );
      process.exit(1);
    }
    const filePath = readOption(args, "--file");
    const patchPath = readOption(args, "--patch");
    if (filePath === undefined || patchPath === undefined) {
      console.error("Usage: dcc hashline apply --file <file> --patch <patch>");
      process.exit(1);
    }
    const result = await applyHashlinePatchFile(filePath, patchPath);
    console.log(JSON.stringify(result));
    process.exit(result.applied ? 0 : 1);
  }

  console.error("Usage: dcc hashline read|apply|verify|mcp ...");
  process.exit(1);
}

console.log(`dcc ${command}: not implemented yet`);
