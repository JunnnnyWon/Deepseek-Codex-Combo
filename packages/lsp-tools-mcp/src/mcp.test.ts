import { describe, expect, it } from "vitest";
import { describeLspMcpServer, handleLspMcpJsonRpc } from "./mcp";

describe("lsp mcp server", () => {
  it("lists_required_lsp_tools", () => {
    const tools = describeLspMcpServer().tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "lsp.status",
      "lsp.diagnostics",
      "lsp.goto_definition",
      "lsp.find_references",
      "lsp.symbols",
      "lsp.prepare_rename",
      "lsp.rename",
    ]);
    expect(tools.find((tool) => tool.name === "lsp.rename")?.inputSchema.properties).toMatchObject({
      character: { type: "number" },
      filePath: { type: "string" },
      line: { type: "number" },
      newName: { type: "string" },
    });
  });

  it("handles_status_tool_call", () => {
    const response = handleLspMcpJsonRpc({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {},
        name: "lsp.status",
      },
    });

    expect(response).toMatchObject({
      result: {
        status: "ok",
      },
    });
  });

  it("rejects_malformed_requests", () => {
    expect(
      handleLspMcpJsonRpc({
        jsonrpc: "2.0",
        method: 42,
      }),
    ).toMatchObject({
      error: {
        message: "invalid_request",
      },
    });
  });

  it("does_not_respond_to_notifications", () => {
    expect(
      handleLspMcpJsonRpc({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).toBeUndefined();
  });

  it("handles_all_advertised_tools", () => {
    const baseParams = {
      arguments: {
        character: 1,
        filePath: "tests/fixtures/ts-node-app/src/index.ts",
        line: 1,
      },
      name: "",
    };

    const results = [
      handleLspMcpJsonRpc({
        id: 2,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          ...baseParams,
          name: "lsp.diagnostics",
        },
      }),
      handleLspMcpJsonRpc({
        id: 3,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          ...baseParams,
          name: "lsp.goto_definition",
        },
      }),
      handleLspMcpJsonRpc({
        id: 4,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          ...baseParams,
          name: "lsp.find_references",
        },
      }),
      handleLspMcpJsonRpc({
        id: 5,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          ...baseParams,
          name: "lsp.symbols",
        },
      }),
      handleLspMcpJsonRpc({
        id: 6,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          ...baseParams,
          name: "lsp.prepare_rename",
        },
      }),
      handleLspMcpJsonRpc({
        id: 7,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          ...baseParams,
          arguments: {
            ...baseParams.arguments,
            newName: "renamed",
          },
          name: "lsp.rename",
        },
      }),
    ];

    for (const response of results) {
      expect(response).not.toMatchObject({
        error: { message: "tool_not_supported" },
      });
    }
  });
});
