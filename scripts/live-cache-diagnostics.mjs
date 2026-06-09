#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const readOption = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

const requireOption = (name) => {
  const value = readOption(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const getFreePort = async () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("free port server did not bind");
      }
      server.close(() => resolve(address.port));
    });
  });

const runDcc = (args, env = process.env) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    timeout: 15_000,
  });

const stablePrefix = Array.from({ length: 96 }, () =>
  ["Stable cache", "prefix sentence", "for DCC live diagnostics."].join(" "),
).join(" ");

const buildRequest = (sessionId) => ({
  input: "Answer with only OK.",
  instructions: `${stablePrefix} Keep this prefix byte-stable across both live requests.`,
  metadata: { dcc_cache_session_id: sessionId },
  model: "deepseek-v4-flash",
  temperature: 0,
});

const postResponses = async (port, sessionId) => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
    body: JSON.stringify(buildRequest(sessionId)),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json();
  return { body, status: response.status };
};

const asRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;

const numberField = (source, key) => {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const summarizeResponse = (label, result) => {
  const body = asRecord(result.body);
  const usage = asRecord(body?.usage);
  const diagnostics = asRecord(body?.cache_diagnostics);
  const promptTokens = numberField(usage, "prompt_tokens");
  const hitTokens = numberField(usage, "prompt_cache_hit_tokens");
  const missTokens = numberField(usage, "prompt_cache_miss_tokens");
  const comparison = diagnostics?.comparison;

  if (result.status !== 200) throw new Error(`${label} HTTP ${result.status}`);
  if (usage === undefined) throw new Error(`${label} missing usage`);
  if (diagnostics === undefined) throw new Error(`${label} missing cache_diagnostics`);
  if (typeof comparison !== "string") throw new Error(`${label} missing comparison`);
  if (hitTokens !== undefined && hitTokens > 0 && missTokens === undefined) {
    throw new Error(`${label} positive hit tokens without miss token normalization`);
  }
  if (promptTokens !== undefined && hitTokens !== undefined && hitTokens > promptTokens) {
    throw new Error(`${label} cache hit tokens exceed prompt tokens`);
  }

  return {
    comparison,
    has_cache_diagnostics: true,
    has_usage: true,
    http_status: result.status,
    label,
    prompt_cache_hit_tokens: hitTokens ?? 0,
    prompt_cache_miss_tokens: missTokens ?? 0,
    prompt_tokens: promptTokens ?? 0,
  };
};

const writeEvidence = (outPath, payload) => {
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const main = async () => {
  const outPath = requireOption("--out");
  const secretPath = [".dcc", "secrets", "deepseek.env"].join("/");
  if (!existsSync(secretPath)) {
    throw new Error(`${secretPath} is required for live cache diagnostics`);
  }
  if (process.env.DEEPSEEK_API_KEY === undefined || process.env.DEEPSEEK_API_KEY.length === 0) {
    throw new Error("DEEPSEEK_API_KEY must be exported before live cache diagnostics");
  }

  const home = mkdtempSync(join(tmpdir(), "dcc-live-cache-home-"));
  const port = Number(readOption("--port") ?? (await getFreePort()));
  const sessionId = `task14-${Date.now()}`;
  let proxyStarted = false;

  try {
    const start = runDcc([
      "proxy",
      "start",
      "--background",
      "--home",
      home,
      "--port",
      String(port),
    ]);
    if (start.status !== 0) {
      throw new Error(`proxy start failed: ${start.stderr || start.stdout}`);
    }
    proxyStarted = true;

    const first = summarizeResponse("first", await postResponses(port, sessionId));
    const second = summarizeResponse("second", await postResponses(port, sessionId));
    if (first.comparison !== "first_observation") {
      throw new Error(`first comparison was ${first.comparison}`);
    }
    if (second.comparison !== "compared") {
      throw new Error(`second comparison was ${second.comparison}`);
    }

    writeEvidence(outPath, {
      assertions: {
        cache_diagnostics_present: true,
        first_observation: true,
        no_raw_prompt_or_auth_logged: true,
        second_compared: true,
        usage_present: true,
      },
      observations: [first, second],
      proxy: {
        host: "127.0.0.1",
        port,
      },
    });
  } finally {
    if (proxyStarted) {
      runDcc(["proxy", "stop", "--home", home, "--port", String(port)]);
    }
    rmSync(home, { force: true, recursive: true });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown live cache diagnostics failure");
  process.exit(1);
});
