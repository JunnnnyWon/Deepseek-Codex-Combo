import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLspDiagnostics } from "./index";

describe("lsp diagnostics", () => {
  it("typescript_fixture_returns_diagnostics", () => {
    const fixturePath = join(process.cwd(), "tests/fixtures/ts-node-app/src/index.ts");
    const result = runLspDiagnostics(fixturePath);

    expect(result.language).toBe("typescript");
    expect(result.status).toBe("ok");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "ts_warning_diagnostic",
      severity: "warning",
      line: 2,
    });
  });
});
