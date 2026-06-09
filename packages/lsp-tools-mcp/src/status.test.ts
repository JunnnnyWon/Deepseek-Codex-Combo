import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLspStatus } from "./index";

describe("lsp status", () => {
  it("missing_server_returns_graceful_warning", () => {
    const fixturePath = join(process.cwd(), "tests/fixtures/python-fastapi/app.py");
    const result = runLspStatus(fixturePath, { DCC_LSP_DISABLE_PYTHON: "1" });

    expect(result.status).toBe("lsp_unavailable");
    expect(result.language).toBe("python");
    expect(result.warnings).toContain("lsp_unavailable");
  });
});
