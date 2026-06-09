import { stdin, stdout } from "node:process";
import { runAstGrepListLanguages, runAstGrepRewrite, runAstGrepSearch } from "./engine.ts";

type AstGrepToolName = "ast_grep.list_languages" | "ast_grep.search" | "ast_grep.rewrite";

interface McpTool {
  readonly description: string;
  readonly inputSchema: { readonly properties: Record<string, unknown>; readonly type: "object" };
  readonly name: AstGrepToolName;
}

interface RawRequest {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

interface RawToolParams {
  readonly arguments?: unknown;
  readonly name?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const makeTool = (name: AstGrepToolName, description: string): McpTool => ({
  description,
  inputSchema: {
    properties:
      name === "ast_grep.list_languages"
        ? {}
        : {
            dryRun: { type: "boolean" },
            language: { type: "string" },
            path: { type: "string" },
            pattern: { type: "string" },
            rewrite: { type: "string" },
          },
    type: "object",
  },
  name,
});

export const describeAstGrepMcpServer = (): { readonly tools: readonly McpTool[] } => ({
  tools: [
    makeTool("ast_grep.list_languages", "List supported AST-grep languages."),
    makeTool("ast_grep.search", "Search source files with structural metavariable patterns."),
    makeTool("ast_grep.rewrite", "Preview or apply structural rewrites. Dry-run is the default."),
  ],
});

const respond = (id: unknown, result: unknown): Record<string, unknown> => ({
  id: typeof id === "string" || typeof id === "number" || id === null ? id : null,
  jsonrpc: "2.0",
  result,
});

const respondError = (id: unknown, message: string): Record<string, unknown> => ({
  error: { code: -32602, message },
  id: typeof id === "string" || typeof id === "number" || id === null ? id : null,
  jsonrpc: "2.0",
});

const readString = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
};

const readBoolean = (args: Record<string, unknown>, key: string): boolean | undefined => {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
};

export const handleAstGrepMcpJsonRpc = (input: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(input) || typeof (input as RawRequest).method !== "string") {
    return respondError(null, "invalid_request");
  }
  const request = input as RawRequest;
  if (request.id === undefined) {
    return undefined;
  }
  if (request.method === "initialize") {
    return respond(request.id, {
      capabilities: { tools: {} },
      protocolVersion: "2024-11-05",
      serverInfo: { name: "dcc-ast-grep", version: "0.1.0" },
    });
  }
  if (request.method === "tools/list") {
    return respond(request.id, describeAstGrepMcpServer());
  }
  if (request.method !== "tools/call" || !isRecord(request.params)) {
    return respondError(request.id, "method_not_supported");
  }
  const params = request.params as RawToolParams;
  const toolArgs = isRecord(params.arguments) ? params.arguments : {};

  try {
    if (params.name === "ast_grep.list_languages") {
      return respond(request.id, { languages: runAstGrepListLanguages() });
    }
    const language = readString(toolArgs, "language") ?? "typescript";
    const path = readString(toolArgs, "path");
    const pattern = readString(toolArgs, "pattern");
    if (path === undefined || pattern === undefined) {
      return respondError(request.id, "missing_path_or_pattern");
    }
    if (params.name === "ast_grep.search") {
      return respond(request.id, runAstGrepSearch({ language, path, pattern }));
    }
    if (params.name === "ast_grep.rewrite") {
      const rewrite = readString(toolArgs, "rewrite");
      if (rewrite === undefined) {
        return respondError(request.id, "missing_rewrite");
      }
      return respond(
        request.id,
        runAstGrepRewrite({
          dryRun: readBoolean(toolArgs, "dryRun") ?? true,
          language,
          path,
          pattern,
          rewrite,
        }),
      );
    }
    return respondError(request.id, "tool_not_supported");
  } catch (error) {
    return respondError(request.id, error instanceof Error ? error.message : "ast_grep_failed");
  }
};

export const startAstGrepMcpStdioServer = async (): Promise<void> => {
  let buffer = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) {
        const response = handleAstGrepMcpJsonRpc(JSON.parse(line));
        if (response !== undefined) {
          stdout.write(`${JSON.stringify(response)}\n`);
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
};
