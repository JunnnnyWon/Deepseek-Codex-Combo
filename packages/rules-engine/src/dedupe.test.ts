import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dedupeRules } from "./dedupe";
import { discoverRules } from "./discoverRules";

const fixtureRoot = join(process.cwd(), "tests/fixtures/rules/duplicate-sources");

describe("dedupeRules", () => {
  it("dedupes_by_normalized_content_hash", async () => {
    const unique = dedupeRules(await discoverRules(fixtureRoot));
    const sources = unique.map((rule) => rule.sourcePath);

    expect(sources).toContain(".dcc/rules/testing.md");
    expect(sources).not.toContain(".omo/rules/testing-copy.md");
    expect(unique).toHaveLength(6);
  });
});
