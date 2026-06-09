import { describe, expect, it } from "vitest";
import { parseBoulderState } from "./schema";

describe("boulder schema", () => {
  it("parses_active_session_schema", () => {
    const state = parseBoulderState({
      activeSessionId: "dcc_20260607_120000_abcd",
      sessions: {
        dcc_20260607_120000_abcd: {
          acceptance: [{ evidence: [], id: "A1", status: "pending", text: "All tests pass" }],
          createdAt: "2026-06-07T12:00:00.000Z",
          modelProfile: "deepseek-pro",
          planPath: "plans/fastify-migration.md",
          status: "active",
          tasks: [
            {
              evidence: [".dcc/evidence/dcc_1/T1-test.txt"],
              id: "T1",
              status: "done",
              title: "Add Fastify bootstrap",
            },
          ],
          updatedAt: "2026-06-07T12:10:00.000Z",
        },
      },
      version: 1,
    });

    const sessionId = "dcc_20260607_120000_abcd";
    expect(state.activeSessionId).toBe(sessionId);
    expect(state.sessions[sessionId]?.acceptance[0]?.id).toBe("A1");
    expect(state.inactivePlans).toBeUndefined();
  });

  it("preserves_inactive_plan_metadata", () => {
    const state = parseBoulderState({
      inactivePlans: {
        "plans/fastify-migration.md": {
          active: false,
          createdAt: "2026-06-07T12:00:00.000Z",
          planPath: "plans/fastify-migration.md",
          title: "Fastify migration",
        },
      },
      sessions: {},
      version: 1,
    });

    expect(state.inactivePlans?.["plans/fastify-migration.md"]?.title).toBe("Fastify migration");
  });
});
