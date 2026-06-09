import { describe, expect, it } from "vitest";
import { runStopHook } from "./lifecycle";

describe("hook stop", () => {
  it("stop_blocks_missing_boulder_evidence", () => {
    const result = runStopHook({
      activeSessionId: "dcc_active",
      sessions: {
        dcc_active: {
          acceptance: [{ evidence: [], id: "A1", status: "pending", text: "Need QA artifact" }],
          createdAt: "2026-06-07T12:00:00.000Z",
          modelProfile: "deepseek-pro",
          planPath: "plans/demo.md",
          status: "active",
          tasks: [],
          updatedAt: "2026-06-07T12:05:00.000Z",
        },
      },
      version: 1,
    });
    const output = result.lines.join("\n");

    expect(result.exitCode).toBe(2);
    expect(output).toContain('"decision":"block"');
    expect(output).toContain("missing_evidence");
    expect(output).toContain("A1");
  });
});
