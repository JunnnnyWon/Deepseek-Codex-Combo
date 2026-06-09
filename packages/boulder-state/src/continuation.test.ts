import { describe, expect, it } from "vitest";
import { evaluateContinuation } from "./continuation";
import { parseBoulderState } from "./schema";

const baseState = parseBoulderState({
  activeSessionId: "dcc_active",
  sessions: {
    dcc_active: {
      acceptance: [{ evidence: [], id: "A1", status: "pending", text: "Stop needs evidence" }],
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

describe("boulder continuation", () => {
  it("stop_blocks_incomplete_plan", () => {
    const result = evaluateContinuation(baseState);
    const output = result.lines.join("\n");

    expect(result.exitCode).toBe(2);
    expect(output).toContain('"decision":"block"');
    expect(output).toContain("missing_evidence");
    expect(output).toContain("A1");
  });

  it("stop_allows_complete_evidence", () => {
    const activeSessionKey = "dcc_active";
    const activeSession = baseState.sessions[activeSessionKey];
    if (activeSession === undefined) {
      throw new Error("missing test session");
    }
    const complete = parseBoulderState({
      ...baseState,
      sessions: {
        dcc_active: {
          ...activeSession,
          acceptance: [
            {
              evidence: [".dcc/evidence/dcc_active/test.txt"],
              id: "A1",
              status: "done",
              text: "Stop needs evidence",
            },
          ],
          status: "complete",
        },
      },
    });
    const result = evaluateContinuation(complete);

    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain('"decision":"approve"');
  });
});
