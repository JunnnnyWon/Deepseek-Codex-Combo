import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("dcc lsp CLI", () => {
  it("mcp_describe_lists_the_expected_tools", () => {
    const result = spawnSync(process.execPath, ["bin/dcc.mjs", "lsp", "mcp", "--describe"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });

    expect(result.status).toBe(0);
    const parsedOutput = JSON.parse(result.stdout);
    expect(parsedOutput.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "lsp.status",
      "lsp.diagnostics",
      "lsp.goto_definition",
      "lsp.find_references",
      "lsp.symbols",
      "lsp.prepare_rename",
      "lsp.rename",
    ]);
  });

  it("diagnostics_reports_typescript_diagnostics", () => {
    const result = spawnSync(
      process.execPath,
      ["bin/dcc.mjs", "lsp", "diagnostics", "tests/fixtures/ts-node-app/src/index.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );

    const parsedOutput = JSON.parse(`${result.stdout}\n${result.stderr}`);
    expect(result.status).toBe(0);
    expect(parsedOutput.language).toBe("typescript");
    expect(parsedOutput.status).toBe("ok");
    expect(Array.isArray(parsedOutput.diagnostics)).toBe(true);
  });

  it("diagnostics_warns_when_python_server_is_disabled", () => {
    const result = spawnSync(
      process.execPath,
      ["bin/dcc.mjs", "lsp", "diagnostics", "tests/fixtures/python-fastapi/app.py"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, DCC_LSP_DISABLE_PYTHON: "1" },
        timeout: 5_000,
      },
    );
    const parsedOutput = JSON.parse(`${result.stdout}\n${result.stderr}`);

    expect(result.status).toBe(0);
    expect(parsedOutput.language).toBe("python");
    expect(parsedOutput.warnings).toContain("lsp_unavailable");
  });

  it("post_tool_use_blocks_ts_errors", () => {
    const result = spawnSync(
      process.execPath,
      [
        "bin/dcc.mjs",
        "hooks",
        "post-tool-use",
        "--fixture",
        "tests/fixtures/hooks/ts-error-post-tool-use.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(2);
    expect(output).toContain("LSP diagnostics");
    expect(output).toContain("ts_error_diagnostic");
  });
});
