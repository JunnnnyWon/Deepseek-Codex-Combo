import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const requiredPaths = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "biome.json",
  "vitest.config.ts",
  ".dockerignore",
  ".gitignore",
  ".agents/plugins/marketplace.json",
  ".github/workflows/ci.yml",
  "bin/dcc.mjs",
  "bin/deepseek-codex-combo.mjs",
  "docker/user-install.Dockerfile",
  "packages/cli/package.json",
  "packages/cli/src/index.ts",
  "packages/codex-installer/package.json",
  "packages/codex-installer/src/index.ts",
  "packages/provider-proxy/package.json",
  "packages/provider-proxy/src/index.ts",
  "packages/model-core/package.json",
  "packages/model-core/src/index.ts",
  "packages/prompts-core/package.json",
  "packages/prompts-core/src/index.ts",
  "packages/rules-engine/package.json",
  "packages/rules-engine/src/index.ts",
  "packages/boulder-state/package.json",
  "packages/boulder-state/src/index.ts",
  "packages/comment-checker-core/package.json",
  "packages/comment-checker-core/src/index.ts",
  "packages/lsp-tools-mcp/package.json",
  "packages/lsp-tools-mcp/src/index.ts",
  "packages/ast-grep-mcp/package.json",
  "packages/ast-grep-mcp/src/index.ts",
  "packages/hashline-core/package.json",
  "packages/hashline-core/src/index.ts",
  "packages/telemetry/package.json",
  "packages/telemetry/src/index.ts",
  "packages/shared/package.json",
  "packages/shared/src/index.ts",
  "plugins/deepseek-codex-combo/.codex-plugin/plugin.json",
  "plugins/deepseek-codex-combo/.mcp.json",
  "plugins/deepseek-codex-combo/hooks/hooks.json",
  "plugins/deepseek-codex-combo/model-catalog.deepseek.json",
  "plugins/deepseek-codex-combo/package.json",
  "plugins/deepseek-codex-combo/skills/dcc-plan/SKILL.md",
  "plugins/deepseek-codex-combo/agents/dcc-planner-pro.toml",
  "scripts/docker-user-install-e2e.mjs",
  "scripts/docker-user-install-scenario.mjs",
  "docs/docker-user-install-e2e.md",
  "tests/unit/scaffold/repo-layout.test.ts",
  "tests/unit/scaffold/package-scripts.test.ts",
  "tests/e2e/docker/user-install.test.ts",
  "tests/e2e/cli/help.test.ts",
];

describe("repo layout", () => {
  it("contains all Task 1 scaffold files", () => {
    const missing = requiredPaths.filter(
      (candidate) => !existsSync(join(process.cwd(), candidate)),
    );

    expect(missing).toEqual([]);
  });
});
