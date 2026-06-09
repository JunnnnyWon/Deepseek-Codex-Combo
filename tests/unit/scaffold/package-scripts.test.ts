import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const expectedScripts: Readonly<Record<string, string>> = {
  lint: "biome check .",
  typecheck: "tsc --noEmit -p tsconfig.base.json",
  test: "node scripts/vitest-run.mjs",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "vitest run tests/e2e",
  "test:docker:e2e": "node scripts/docker-user-install-e2e.mjs",
  "test:docker:e2e:live": "node scripts/docker-user-install-e2e.mjs --live",
  "test:docker:e2e:vitest": "vitest run tests/e2e/docker/user-install.test.ts",
  build: "node scripts/build-cli.mjs && pnpm -r build",
  dcc: "node bin/dcc.mjs",
};

describe("package scripts", () => {
  it("matches Task 1 script contract", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toBeDefined();
    if (packageJson.scripts === undefined) {
      throw new Error("scripts missing from root package.json");
    }
    const scripts = packageJson.scripts;

    for (const [key, value] of Object.entries(expectedScripts)) {
      expect(scripts[key]).toBe(value);
    }
  });
});
