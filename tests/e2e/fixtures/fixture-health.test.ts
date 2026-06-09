import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const fixtureManifestSchema = z.object({
  commands: z.array(z.string()).min(1),
  name: z.string(),
  status: z.union([z.literal("healthy"), z.literal("broken")]),
});

const expectedFixtures = [
  { commands: ["pnpm test"], name: "ts-node-app" },
  { commands: ["python -m pytest"], name: "python-fastapi" },
  { commands: ["cargo test"], name: "rust-cli" },
  { commands: ["pnpm test"], name: "broken-monorepo" },
] as const;

describe("fixture repository health", () => {
  it("all_fixture_repos_have_expected_commands", () => {
    for (const fixture of expectedFixtures) {
      const fixtureRoot = join(process.cwd(), "tests/fixtures", fixture.name);
      const manifestPath = join(fixtureRoot, "fixture.json");

      expect(existsSync(manifestPath)).toBe(true);

      const manifest = fixtureManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
      expect(manifest.name).toBe(fixture.name);
      expect(manifest.commands).toEqual(fixture.commands);

      const result = spawnSync("node", ["bin/dcc.mjs", "fixtures", "verify", fixtureRoot], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("fixture: ok");
    }
  });

  it("reports invalid fixture missing package metadata", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "fixtures", "verify", "tests/fixtures/broken-empty"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("fixture_invalid");
  });
});
