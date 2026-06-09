import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startBoulderSession } from "./session";

describe("boulder session lock", () => {
  it("second_active_session_requires_explicit_id", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "dcc-boulder-lock-"));
    await startBoulderSession({ cwd, now: "2026-06-07T12:00:00.000Z", planPath: "plans/a.md" });

    await expect(
      startBoulderSession({ cwd, now: "2026-06-07T12:01:00.000Z", planPath: "plans/b.md" }),
    ).rejects.toMatchObject({ code: "active_session_exists" });

    const explicit = await startBoulderSession({
      cwd,
      now: "2026-06-07T12:02:00.000Z",
      planPath: "plans/b.md",
      sessionId: "dcc_explicit",
    });
    expect(explicit.session.id).toBe("dcc_explicit");
    expect(explicit.evidenceDir).toBe(".dcc/evidence/dcc_explicit");
  });
});
