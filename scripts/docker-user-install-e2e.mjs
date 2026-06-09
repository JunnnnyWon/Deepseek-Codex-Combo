#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const containerRepo = "/work/Deepseek-Codex-Combo";
const containerHome = "/home/dcc-user";
const containerCodexHome = `${containerHome}/.codex`;
const dockerfilePath = "docker/user-install.Dockerfile";

const args = new Set(process.argv.slice(2));
const liveMode = args.has("--live");
const preflightOnly = args.has("--preflight-only");
const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const evidenceDir = join(repoRoot, ".dcc", "evidence", "docker-user-install", timestamp);
const containerEvidenceDir = `${containerRepo}/.dcc/evidence/docker-user-install/${timestamp}`;
const codexCliVersion = process.env.CODEX_CLI_VERSION ?? "0.130.0";
const imageTag = `dcc-user-install-e2e:${timestamp.toLowerCase()}`;
const containerName = `dcc-user-install-e2e-${timestamp.toLowerCase()}`;

const secret = process.env.DEEPSEEK_API_KEY ?? "";

const redact = (text) => {
  if (secret.length === 0) {
    return text;
  }
  return text.split(secret).join("[REDACTED_DEEPSEEK_API_KEY]");
};

const run = (label, command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 50 * 1024 * 1024,
    timeout: options.timeout ?? 600_000,
  });
  const output = redact(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (options.logPath !== undefined) {
    writeFileSync(options.logPath, output, "utf8");
  }
  if (result.error !== undefined) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}\n${output}`);
  }
  return output;
};

const docker = (label, commandArgs, options = {}) => run(label, "docker", commandArgs, options);

const writeJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const preflight = () => {
  mkdirSync(evidenceDir, { recursive: true });
  const dockerVersion = docker("docker version", ["version", "--format", "{{json .}}"], {
    logPath: join(evidenceDir, "preflight-docker-version.log"),
    timeout: 30_000,
  });
  const buildxVersion = docker("docker buildx version", ["buildx", "version"], {
    logPath: join(evidenceDir, "preflight-buildx.log"),
    timeout: 30_000,
  });
  const payload = {
    buildxVersion: buildxVersion.trim(),
    dockerVersion: JSON.parse(dockerVersion),
    mode: liveMode ? "live" : "mock",
    paths: {
      containerCodexHome,
      containerHome,
      containerRepo,
      hostCodexHome: process.env.CODEX_HOME ?? null,
      hostRepo: repoRoot,
    },
    timestamp,
  };
  writeJson(join(evidenceDir, "preflight.json"), payload);
  writeFileSync(
    join(evidenceDir, "preflight.log"),
    `mode=${payload.mode}\ncontainerRepo=${containerRepo}\ncontainerHome=${containerHome}\n`,
    "utf8",
  );
};

const runFullScenario = () => {
  const buildLog = join(evidenceDir, "docker-build.log");
  docker(
    "docker build",
    [
      "build",
      "-f",
      dockerfilePath,
      "--build-arg",
      `CODEX_CLI_VERSION=${codexCliVersion}`,
      "-t",
      imageTag,
      ".",
    ],
    { logPath: buildLog, timeout: 1_200_000 },
  );

  docker(
    "docker image smoke",
    ["run", "--rm", imageTag, "bash", "-lc", "codex --version && pnpm --version"],
    {
      logPath: join(evidenceDir, "image-smoke.log"),
      timeout: 120_000,
    },
  );

  const runArgs = [
    "run",
    "--name",
    containerName,
    "--env",
    `DCC_DOCKER_MODE=${liveMode ? "live" : "mock"}`,
    "--env",
    `DCC_DOCKER_EVIDENCE_DIR=${containerEvidenceDir}`,
    "--env",
    `HOME=${containerHome}`,
    "--env",
    `CODEX_HOME=${containerCodexHome}`,
  ];
  if (liveMode) {
    runArgs.push("--env", "DEEPSEEK_API_KEY");
  } else {
    runArgs.push("--env", "DEEPSEEK_API_KEY=");
  }
  runArgs.push(imageTag, "node", "scripts/docker-user-install-scenario.mjs");

  try {
    docker("docker run", runArgs, {
      env: liveMode ? process.env : { ...process.env, DEEPSEEK_API_KEY: "" },
      logPath: join(evidenceDir, "container.log"),
      timeout: 1_800_000,
    });
  } finally {
    spawnSync("docker", ["cp", `${containerName}:${containerEvidenceDir}/.`, evidenceDir], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 120_000,
    });
    docker("docker rm", ["rm", "-f", containerName], {
      logPath: join(evidenceDir, "container-cleanup.log"),
      timeout: 120_000,
    });
  }
};

const main = () => {
  try {
    if (liveMode && secret.length === 0) {
      throw new Error("DEEPSEEK_API_KEY is required for live Docker E2E");
    }
    preflight();
    if (!preflightOnly) {
      runFullScenario();
    }
    writeJson(join(evidenceDir, "summary.json"), {
      evidenceDir,
      mode: liveMode ? "live" : "mock",
      status: "passed",
    });
    console.log(`Docker user-install E2E passed: ${evidenceDir}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    mkdirSync(evidenceDir, { recursive: true });
    writeJson(join(evidenceDir, "summary.json"), {
      evidenceDir,
      mode: liveMode ? "live" : "mock",
      status: "failed",
      error: redact(message),
    });
    console.error(redact(message));
    process.exitCode = 1;
  }
};

main();
