import { stdin, stdout } from "node:process";
import { runLspDiagnostics } from "./diagnostics.ts";
import { runLspPrepareRename, runLspRename } from "./rename.ts";
import { runLspStatus } from "./status.ts";
import { runLspFindReferences, runLspGotoDefinition, runLspSymbols } from "./symbols.ts";

const toolNames = [
  "lsp.status",
  "lsp.diagnostics",
  "lsp.goto_definition",
  "lsp.find_references",
  "lsp.symbols",
  "lsp.prepare_rename",
  "lsp.rename",
] as const;

type ToolName = (typeof toolNames)[number];

interface JsonRpcRequest {
  readonly id?: number | string | null;
  readonly method: string;
  readonly params?: unknown;
}

interface RawJsonRpcRequest {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

interface RawToolArguments {
  readonly character?: unknown;
  readonly filePath?: unknown;
  readonly line?: unknown;
  readonly newName?: unknown;
}

interface RawToolParams {
  readonly arguments?: unknown;
  readonly name?: unknown;
}

interface McpTool {
  readonly description: string;
  readonly inputSchema: {
    readonly properties: Record<string, unknown>;
    readonly type: "object";
  };
  readonly name: ToolName;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRawJsonRpcRequest = (value: unknown): value is RawJsonRpcRequest => isRecord(value);
const isRawToolParams = (value: unknown): value is RawToolParams => isRecord(value);
const isRawToolArguments = (value: unknown): value is RawToolArguments => isRecord(value);

const readMethod = (value: unknown): JsonRpcRequest | undefined => {
  if (!isRawJsonRpcRequest(value) || typeof value.method !== "string") {
    return undefined;
  }
  const id =
    typeof value.id === "string" || typeof value.id === "number" || value.id === null
      ? value.id
      : undefined;
  return {
    ...(id === undefined ? {} : { id }),
    method: value.method,
    ...(value.params === undefined ? {} : { params: value.params }),
  };
};

const readArguments = (params: unknown): Record<string, unknown> => {
  if (!isRawToolParams(params)) {
    return {};
  }
  return isRecord(params.arguments) ? params.arguments : {};
};

const readToolName = (params: unknown): string | undefined =>
  isRawToolParams(params) && typeof params.name === "string" ? params.name : undefined;

const readFilePath = (args: unknown): string | undefined =>
  isRawToolArguments(args) && typeof args.filePath === "string" ? args.filePath : undefined;

const readNumber = (args: unknown, key: keyof RawToolArguments): number | undefined => {
  if (!isRawToolArguments(args)) {
    return undefined;
  }
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const readNewName = (args: unknown): string | undefined => {
  if (!isRawToolArguments(args)) {
    return undefined;
  }
  return typeof args.newName === "string" ? args.newName : undefined;
};

const makeTool = (name: ToolName, description: string): McpTool => ({
  description,
  inputSchema: {
    properties:
      name === "lsp.rename"
        ? {
            character: { type: "number" },
            filePath: { type: "string" },
            line: { type: "number" },
            newName: { type: "string" },
          }
        : name === "lsp.prepare_rename" ||
            name === "lsp.goto_definition" ||
            name === "lsp.find_references"
          ? {
              character: { type: "number" },
              filePath: { type: "string" },
              line: { type: "number" },
            }
          : { filePath: { type: "string" } },
    type: "object",
  },
  name,
});

export const describeLspMcpServer = (): { readonly tools: readonly McpTool[] } => ({
  tools: [
    makeTool("lsp.status", "Report LSP availability for a file or workspace."),
    makeTool("lsp.diagnostics", "Return diagnostics for a TypeScript, JavaScript, or Python file."),
    makeTool("lsp.goto_definition", "Find a lightweight definition location."),
    makeTool("lsp.find_references", "Find lightweight references."),
    makeTool("lsp.symbols", "List lightweight document symbols."),
    makeTool("lsp.prepare_rename", "Check whether a symbol can be renamed."),
    makeTool("lsp.rename", "Return lightweight rename edits."),
  ],
});

const respond = (id: JsonRpcRequest["id"], result: unknown): Record<string, unknown> => ({
  id: id ?? null,
  jsonrpc: "2.0",
  result,
});

const respondError = (id: JsonRpcRequest["id"], message: string): Record<string, unknown> => ({
  error: {
    code: -32602,
    message,
  },
  id: id ?? null,
  jsonrpc: "2.0",
});

export const handleLspMcpJsonRpc = (input: unknown): Record<string, unknown> | undefined => {
  const request = readMethod(input);
  if (request === undefined) {
    return respondError(null, "invalid_request");
  }
  if (request.id === undefined) {
    return undefined;
  }

  if (request.method === "initialize") {
    return respond(request.id, {
      capabilities: { tools: {} },
      protocolVersion: "2024-11-05",
      serverInfo: { name: "dcc-lsp", version: "0.1.0" },
    });
  }
  if (request.method === "tools/list") {
    return respond(request.id, describeLspMcpServer());
  }
  if (request.method !== "tools/call") {
    return respondError(request.id, "method_not_supported");
  }

  const toolName = readToolName(request.params);
  const args = readArguments(request.params);
  const filePath = readFilePath(args);
  const line = readNumber(args, "line") ?? 1;
  const character = readNumber(args, "character") ?? 1;
  const newName = readNewName(args) ?? "";
  if (toolName === "lsp.status") {
    return respond(request.id, runLspStatus(filePath));
  }
  if (toolName === "lsp.diagnostics" && filePath !== undefined) {
    return respond(request.id, runLspDiagnostics(filePath));
  }
  if (toolName === "lsp.goto_definition" && filePath !== undefined) {
    return respond(request.id, runLspGotoDefinition(filePath, line, character));
  }
  if (toolName === "lsp.find_references" && filePath !== undefined) {
    return respond(request.id, runLspFindReferences(filePath, line, character));
  }
  if (toolName === "lsp.symbols" && filePath !== undefined) {
    return respond(request.id, runLspSymbols(filePath));
  }
  if (toolName === "lsp.prepare_rename" && filePath !== undefined) {
    return respond(request.id, runLspPrepareRename(filePath, line, character));
  }
  if (toolName === "lsp.rename" && filePath !== undefined) {
    return respond(request.id, runLspRename(filePath, line, character, newName));
  }
  return respondError(request.id, "tool_not_supported");
};

export const startLspMcpStdioServer = async (): Promise<void> =>
  new Promise((resolve) => {
    let pending = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      pending += chunk;
      let newlineIndex = pending.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = pending.slice(0, newlineIndex).trim();
        pending = pending.slice(newlineIndex + 1);
        if (line.length > 0) {
          const response = handleLspMcpJsonRpc(JSON.parse(line));
          if (response !== undefined) {
            stdout.write(`${JSON.stringify(response)}\n`);
          }
        }
        newlineIndex = pending.indexOf("\n");
      }
    });
    stdin.on("end", resolve);
  });
