#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { proxyResponse, routeCases } from "./docker-user-install-routes.mjs";
import {
  assertFile,
  assertText,
  createRedactor,
  createStepRunner,
  getFreePort,
  writeJson,
} from "./docker-user-install-shared.mjs";

const repoRoot = process.cwd();
const mode = process.env.DCC_DOCKER_MODE ?? "mock";
const evidenceDir =
  process.env.DCC_DOCKER_EVIDENCE_DIR ??
  join(repoRoot, ".dcc", "evidence", "docker-user-install", "container-local");
const stepsDir = join(evidenceDir, "steps");
const userHome = process.env.HOME ?? "/home/dcc-user";
const codexHome = process.env.CODEX_HOME ?? join(userHome, ".codex");
const releaseDir = join(repoRoot, ".dcc", "release-docker");
const releaseRoot = join(releaseDir, "files");
const releaseCli = join(releaseRoot, "dist", "bin", "dcc.mjs");
const installedCli = join(
  codexHome,
  "plugins",
  "cache",
  "deepseek-codex-combo",
  "deepseek-codex-combo",
  "0.1.0",
  "dist",
  "bin",
  "dcc.mjs",
);

const secret = process.env.DEEPSEEK_API_KEY ?? "";

const redact = createRedactor(secret);
const runStep = createStepRunner({ redact, repoRoot, stepsDir });

const writeMockFixture = () => {
  const fixturePath = join(userHome, "mock-upstream-response.json");
  writeJson(fixturePath, {
    chatCompletion: {
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          message: { content: "docker mock response ok", role: "assistant" },
        },
      ],
      id: "chatcmpl_docker_mock",
      model: "deepseek-v4-flash",
      object: "chat.completion",
    },
    request: {
      input: "docker mock smoke",
      model: "deepseek-v4-flash",
      stream: false,
    },
  });
  return fixturePath;
};

const routeAndAssert = (name, prompt, expectedModel, expectedAgent) => {
  const route = runStep(`route-${name}`, process.execPath, [
    releaseCli,
    "switch",
    "auto",
    "--home",
    userHome,
    "--prompt",
    prompt,
  ]);
  assertText(`route ${name}`, route.stdout, `model: ${expectedModel}`);
  assertText(`route ${name}`, route.stdout, `dcc_agent = "${expectedAgent}"`);
  writeFileSync(
    join(evidenceDir, `deepseek-current-after-${name}.toml`),
    readFileSync(join(codexHome, "profiles", "deepseek-current.toml"), "utf8"),
    "utf8",
  );
  runStep(`codex-prompt-input-${name}`, "codex", [
    "--profile",
    "deepseek-current",
    "debug",
    "prompt-input",
    prompt,
  ]);
};

const main = async () => {
  mkdirSync(stepsDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, "config.toml"), '[dcc_user_sentinel]\nvalue = "keep"\n', "utf8");

  runStep("pnpm-install", "pnpm", ["install"], { timeout: 600_000 });
  runStep("pnpm-build", "pnpm", ["build"], { timeout: 600_000 });
  rmSync(releaseDir, { force: true, recursive: true });
  runStep("package", process.execPath, ["bin/dcc.mjs", "package", "--out", releaseDir]);

  const port = await getFreePort();
  const installArgs = [
    releaseCli,
    "install",
    "--home",
    userHome,
    "--provider-mode=proxy",
    "--proxy-port",
    String(port),
    "--no-tui",
  ];
  runStep("install", process.execPath, installArgs);
  runStep("install-idempotent", process.execPath, installArgs);

  for (const path of [
    join(codexHome, "config.toml"),
    join(codexHome, "profiles", "deepseek-flash.toml"),
    join(codexHome, "profiles", "deepseek-proxy.toml"),
    join(codexHome, "profiles", "deepseek-current.toml"),
    join(codexHome, "agents", "dcc-planner-pro.toml"),
    join(codexHome, "agents", "dcc-worker-pro.toml"),
  ]) {
    assertFile(path);
  }
  const config = readFileSync(join(codexHome, "config.toml"), "utf8");
  writeFileSync(join(evidenceDir, "rendered-config.toml"), config, "utf8");
  assertText("config", config, "[profiles.deepseek-flash]");
  assertText("config", config, 'model = "deepseek-v4-flash"');

  for (const profile of ["deepseek-flash", "deepseek-proxy", "deepseek-current"]) {
    runStep(`codex-profile-${profile}`, "codex", ["--profile", profile, "--help"]);
  }

  runStep("sandbox-launcher", "./run-dcc-sandbox.command", [], {
    env: {
      ...process.env,
      DCC_PROXY_PORT: String(port),
      DCC_SANDBOX_HOME: join(userHome, "dcc-sandbox"),
      DCC_SANDBOX_SKIP_CODEX: "1",
      DEEPSEEK_API_KEY: mode === "live" ? secret : "sk-docker-mock-key",
    },
    timeout: 900_000,
  });

  for (const routeCase of routeCases) {
    routeAndAssert(routeCase.name, routeCase.prompt, routeCase.model, routeCase.agent);
  }

  const mockFixture = writeMockFixture();
  const proxyArgs = [
    releaseCli,
    "proxy",
    "start",
    "--background",
    "--home",
    userHome,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ];
  if (mode !== "live") {
    proxyArgs.push("--mock-upstream", mockFixture);
  }
  runStep("proxy-start", process.execPath, proxyArgs);
  runStep("proxy-status-running", process.execPath, [
    releaseCli,
    "proxy",
    "status",
    "--home",
    userHome,
    "--port",
    String(port),
  ]);
  proxyResponse({
    input: "docker flash live smoke",
    mode,
    model: "deepseek-v4-flash",
    name: "flash",
    port,
    runStep,
  });
  proxyResponse({
    input: "docker pro live smoke",
    mode,
    model: "deepseek-v4-pro",
    name: "pro",
    port,
    runStep,
  });
  runStep("proxy-stop", process.execPath, [
    releaseCli,
    "proxy",
    "stop",
    "--home",
    userHome,
    "--port",
    String(port),
  ]);

  runStep("hook-session-start", process.execPath, [installedCli, "hooks", "session-start"]);
  runStep(
    "hook-user-prompt-submit",
    process.execPath,
    [installedCli, "hooks", "user-prompt-submit"],
    {
      input: JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "보안 위험을 검토해줘",
      }),
    },
  );
  runStep("mcp-lsp-describe", process.execPath, [installedCli, "lsp", "mcp", "--describe"]);
  runStep("mcp-ast-grep-describe", process.execPath, [installedCli, "ast-grep", "describe"]);
  runStep("hashline-help", process.execPath, [installedCli, "hashline", "--help"]);

  runStep("uninstall", process.execPath, [releaseCli, "uninstall", "--home", userHome]);
  const cleanedConfig = readFileSync(join(codexHome, "config.toml"), "utf8");
  writeFileSync(join(evidenceDir, "config-after-uninstall.toml"), cleanedConfig, "utf8");
  for (const forbidden of [
    "deepseek_proxy",
    "deepseek-codex-combo",
    "deepseek-current",
    "deepseek-flash",
    "deepseek-proxy",
  ]) {
    if (cleanedConfig.includes(forbidden)) {
      throw new Error(`uninstall left managed text: ${forbidden}`);
    }
  }
  assertText("cleaned config", cleanedConfig, "[dcc_user_sentinel]");
  writeJson(join(evidenceDir, "cleanup-summary.json"), { proxy: "stopped", uninstall: "clean" });
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeJson(join(evidenceDir, "container-summary.json"), {
    error: redact(message),
    mode,
    status: "failed",
  });
  console.error(redact(message));
  process.exitCode = 1;
});
