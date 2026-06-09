import { describe, expect, it } from "vitest";
import { redactText } from "../../../packages/shared/src/redact.ts";

describe("acceptance log redaction", () => {
  it("acceptance_logs_contain_no_secrets", () => {
    const home = "/tmp/dcc-secret-home";
    const rawLog = [
      "command: node bin/dcc.mjs package --out /tmp/dcc-secret-home/release",
      "api_key=sk-task19secret",
      "Authorization: Bearer token.with.parts",
      "origin=https://token@example.com/private/repo",
      "owner=dev@example.com",
      "host=workstation.local",
    ].join("\n");

    const redacted = redactText(rawLog, { homePath: home });

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("sk-task19secret");
    expect(redacted).not.toContain("Bearer token.with.parts");
    expect(redacted).not.toContain(home);
    expect(redacted).not.toContain("token@example.com");
    expect(redacted).not.toContain("dev@example.com");
    expect(redacted).not.toContain("workstation.local");
  });
});
