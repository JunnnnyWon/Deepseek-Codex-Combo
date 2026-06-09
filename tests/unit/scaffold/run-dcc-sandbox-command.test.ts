import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSandboxCommand = (): string =>
  readFileSync(join(process.cwd(), "run-dcc-sandbox.command"), "utf8");

describe("run-dcc-sandbox.command", () => {
  it("delegates_to_the_official_sandbox_command", () => {
    const script = readSandboxCommand();

    expect(script).toContain("pnpm install");
    expect(script).toContain("pnpm build");
    expect(script).toContain('node dist/bin/dcc.mjs sandbox run "$' + '{sandbox_args[@]}" "$@"');
  });

  it("preserves_skip_codex_compatibility_for_e2e_smokes", () => {
    const script = readSandboxCommand();

    expect(script).toContain('if [[ "$' + '{DCC_SANDBOX_SKIP_CODEX:-0}" == "1" ]]');
    expect(script).toContain("sandbox_args+=(--skip-codex)");
  });
});
