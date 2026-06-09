import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSandboxCommand = (): string =>
  readFileSync(join(process.cwd(), "run-dcc-sandbox.command"), "utf8");

describe("run-dcc-sandbox.command", () => {
  it("loads_local_secret_file_before_prompting_for_deepseek_api_key", () => {
    const script = readSandboxCommand();
    const secretLoadIndex = script.indexOf(".dcc/secrets/deepseek.env");
    const promptIndex = script.indexOf('printf "DeepSeek API key: "');

    expect(secretLoadIndex).toBeGreaterThanOrEqual(0);
    expect(promptIndex).toBeGreaterThanOrEqual(0);
    expect(secretLoadIndex).toBeLessThan(promptIndex);
  });

  it("stops_the_managed_proxy_after_codex_exits", () => {
    const script = readSandboxCommand();
    const cleanupIndex = script.indexOf("cleanup_proxy()");
    const codexIndex = script.indexOf('codex --profile "$DCC_CODEX_PROFILE"');

    expect(cleanupIndex).toBeGreaterThanOrEqual(0);
    expect(codexIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeLessThan(codexIndex);
    expect(script).toContain("trap cleanup_proxy EXIT INT TERM");
    expect(script).toContain(
      'node dist/bin/dcc.mjs proxy stop --home "$DCC_SANDBOX_HOME" --port "$DCC_PROXY_PORT"',
    );
    expect(script).toContain('export DCC_CODEX_PROFILE="deepseek-flash"');
    expect(script).not.toContain("exec env HOME=");
  });

  it("routes_auto_prompt_through_deepseek_current_profile", () => {
    const script = readSandboxCommand();

    expect(script).toContain("export DCC_AUTO_PROMPT=");
    expect(script).toContain("DCC_AUTO_PROMPT:-");
    expect(script).toContain('export DCC_CODEX_PROFILE="deepseek-current"');
    expect(script).toContain(
      'node dist/bin/dcc.mjs switch auto --home "$DCC_SANDBOX_HOME" --prompt "$DCC_AUTO_PROMPT"',
    );
    expect(script).toContain("DCC automatic agent route: delegate to ");
    expect(script).toContain("User request:");
  });

  it("restarts_existing_proxy_after_rebuild_to_avoid_stale_runtime", () => {
    const script = readSandboxCommand();
    const buildIndex = script.indexOf("pnpm build");
    const restartStopIndex = script.indexOf(
      'echo "Restarting DCC proxy to use the freshly built runtime."',
    );
    const startIndex = script.indexOf("node dist/bin/dcc.mjs proxy start");

    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(restartStopIndex).toBeGreaterThan(buildIndex);
    expect(startIndex).toBeGreaterThan(restartStopIndex);
  });
});
