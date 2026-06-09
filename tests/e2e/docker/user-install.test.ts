import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runDockerE2e = (args: readonly string[], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(process.execPath, ["scripts/docker-user-install-e2e.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    timeout: 30_000,
  });

const latestEvidenceDir = (): string => {
  const root = join(process.cwd(), ".dcc", "evidence", "docker-user-install");
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const latest = entries.at(-1);
  if (latest === undefined) {
    throw new Error("docker evidence directory is empty");
  }
  return join(root, latest);
};

describe("docker user install e2e runner", () => {
  it("records_preflight_evidence_without_running_container", () => {
    const result = runDockerE2e(["--preflight-only"]);

    expect(result.status).toBe(0);
    const evidenceDir = latestEvidenceDir();
    const preflightPath = join(evidenceDir, "preflight.json");
    expect(existsSync(preflightPath)).toBe(true);

    const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as {
      readonly mode: string;
      readonly paths: {
        readonly containerCodexHome: string;
        readonly containerHome: string;
        readonly containerRepo: string;
      };
    };
    expect(preflight.mode).toBe("mock");
    expect(preflight.paths.containerHome).toBe("/home/dcc-user");
    expect(preflight.paths.containerCodexHome).toBe("/home/dcc-user/.codex");
    expect(preflight.paths.containerRepo).toBe("/work/Deepseek-Codex-Combo");
  }, 45_000);

  it("rejects_live_mode_without_deepseek_api_key_before_docker_run", () => {
    const envWithoutKey: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key !== "DEEPSEEK_API_KEY") {
        envWithoutKey[key] = value;
      }
    }
    const result = runDockerE2e(["--live"], envWithoutKey);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("DEEPSEEK_API_KEY is required for live Docker E2E");
    expect(output).not.toContain("docker run");
  });
});
