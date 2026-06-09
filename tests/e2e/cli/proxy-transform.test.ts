import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("dcc proxy transform-fixture", () => {
  it("transforms_non_stream_fixture_without_leaking_request_input", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "proxy", "transform-fixture", "tests/fixtures/proxy/text-response.json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("response.completed");
    expect(result.stdout).toContain("output_text");
    expect(result.stdout).not.toContain("Summarize the fixture behavior.");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("sk-");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("Authorization");
  });

  it("rejects_invalid_tool_schema_before_upstream", () => {
    const result = spawnSync(
      "node",
      [
        "bin/dcc.mjs",
        "proxy",
        "transform-fixture",
        "tests/fixtures/proxy/invalid-tool-schema.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("tool_schema_error");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("Use a bad tool.");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("sk-");
  });

  it("transforms_cache_usage_fixture_without_leaks", () => {
    const result = spawnSync(
      "node",
      [
        "bin/dcc.mjs",
        "proxy",
        "transform-fixture",
        "tests/fixtures/proxy/cache-usage-response.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("response.completed");
    expect(result.stdout).not.toContain("Cache usage fixture prompt.");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("Authorization");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("sk-");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("reasoning_content");
  });
});
