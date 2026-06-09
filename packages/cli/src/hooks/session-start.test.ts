import { describe, expect, it } from "vitest";
import { runSessionStartHook } from "./lifecycle";

describe("hook session-start", () => {
  it("session_start_outputs_short_status", () => {
    const result = runSessionStartHook();

    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain("DCC: ready");
    expect(result.lines.join("\n")).toContain("model=deepseek-v4-flash");
    expect(result.lines.join("\n")).toContain("telemetry=off");
  });
});
