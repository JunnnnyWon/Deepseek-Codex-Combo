import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeCommandEvidence } from "./evidence";

describe("boulder evidence", () => {
  it("writes_redacted_command_record", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "dcc-boulder-evidence-"));
    const record = await writeCommandEvidence({
      artifactName: "test-output.txt",
      command: "pnpm test",
      cwd,
      exitCode: 0,
      homePath: "/Users/junnnny",
      now: "2026-06-07T12:12:00.000Z",
      output: "ok sk-secret-123 /Users/junnnny/private.ts",
      sessionId: "dcc_test",
      summary: "All tests passed",
    });

    const artifact = await readFile(join(cwd, record.artifact), "utf8");
    const commands = await readFile(join(cwd, ".dcc/evidence/dcc_test/commands.jsonl"), "utf8");

    expect(record).toMatchObject({
      artifact: ".dcc/evidence/dcc_test/test-output.txt",
      command: "pnpm test",
      exitCode: 0,
      summary: "All tests passed",
    });
    expect(artifact).toContain("[REDACTED]");
    expect(artifact).not.toContain("sk-secret-123");
    expect(artifact).not.toContain("/Users/junnnny/private.ts");
    expect(commands).toContain('"type":"command"');
    expect(commands).toContain('"artifact":".dcc/evidence/dcc_test/test-output.txt"');
  });
});
