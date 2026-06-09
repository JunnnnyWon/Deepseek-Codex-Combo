import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const requiredReadmeSections = [
  "What is DeepSeek-Codex-Combo?",
  "Why not just set the model?",
  "Requirements",
  "Install",
  "Set DEEPSEEK_API_KEY",
  "Start proxy",
  "Use with Codex",
  "Commands",
  "Model routing: Pro vs Flash",
  "Troubleshooting",
  "Security / telemetry",
  "Uninstall",
] as const;

const requiredDocs = [
  "docs/architecture.md",
  "docs/install.md",
  "docs/model-routing.md",
  "docs/provider-proxy.md",
  "docs/codex-config.md",
  "docs/troubleshooting.md",
  "docs/security.md",
  "docs/release.md",
  "docs/supply-chain.md",
  "docs/checksums.manifest.json",
  "CHANGELOG.md",
] as const;

const readWorkspaceFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("README and docs contract", () => {
  it("readme_contains_required_sections_and_actual_commands", () => {
    const readme = readWorkspaceFile("README.md");

    for (const section of requiredReadmeSections) {
      expect(readme).toContain(`## ${section}`);
    }

    expect(readme).toContain('export DEEPSEEK_API_KEY="sk-..."');
    expect(readme).toContain("node bin/dcc.mjs package --out .dcc/release-local");
    expect(readme).toContain("node bin/dcc.mjs install --no-tui --provider-mode=proxy");
    expect(readme).toContain("intended public-package command after the package is published");
    expect(readme).toContain("dcc doctor");
    expect(readme).toContain("dcc proxy start");
    expect(readme).toContain("codex --profile deepseek-proxy");
    expect(readme).toContain("node bin/dcc.mjs install --dry-run --provider-mode=proxy");
    expect(readme).toContain("node bin/dcc.mjs install --dry-run --provider-mode=plugin-only");
    expect(readme).toContain("install --help is safe");
    expect(readme).toContain("CODEX_HOME");
    expect(readme).toContain("secret_env");
    expect(readme).toContain("deepseek.env");
    expect(readme).toContain("doctor --live --strict");
    expect(readme).toContain("proxy status");
    expect(readme).toContain("cache_diagnostics");
    expect(readme).toContain("rotate the key");
    expect(readme).toContain('rm "$secret_env"');
    expect(readme).not.toContain("live DeepSeek support verified");
    expect(readme).not.toContain("dcc doctor --live passed");
    expect(readme).not.toMatch(/paste.*API key/i);
    expect(readme).not.toContain("native provider supported");
    expect(readme).not.toContain("cache hits are guaranteed");
  });

  it("docs_required_by_release_are_present_and_nonempty", () => {
    for (const path of requiredDocs) {
      expect(existsSync(join(process.cwd(), path))).toBe(true);
      expect(readWorkspaceFile(path).trim().length).toBeGreaterThan(20);
    }
  });
});
