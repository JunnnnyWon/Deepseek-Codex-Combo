import { stdin, stdout } from "node:process";
import { applyHashlinePatchFile, readHashlineFile, verifyHashlinePatch } from "./hashline.ts";

type HashlineToolName = "hashline.read" | "hashline.apply_patch" | "hashline.verify";

interface HashlineTool {
  readonly description: string;
  readonly inputSchema: { readonly properties: Record<string, unknown>; readonly type: "object" };
  readonly name: HashlineToolName;
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

const makeTool = (name: HashlineToolName, description: string): HashlineTool => ({
  description,
  inputSchema: {
    properties:
      name === "hashline.verify"
        ? { expectedHash: { type: "string" }, line: { type: "string" } }
        : { path: { type: "string" }, patchPath: { type: "string" } },
    type: "object",
  },
  name,
});

export const describeHashlineMcpServer = (): { readonly tools: readonly HashlineTool[] } => ({
  tools: [
    makeTool("hashline.read", "Read a file with stable per-line hashes."),
    makeTool("hashline.apply_patch", "Apply a hashline patch, rejecting stale hashes."),
    makeTool("hashline.verify", "Verify one line against an expected hash."),
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

export const handleHashlineMcpJsonRpc = async (
  input: unknown,
): Promise<Record<string, unknown> | undefined> => {
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
      serverInfo: { name: "dcc-hashline", version: "0.1.0" },
    });
  }
  if (request.method === "tools/list") {
    return respond(request.id, describeHashlineMcpServer());
  }
  if (request.method !== "tools/call" || !isRecord(request.params)) {
    return respondError(request.id, "method_not_supported");
  }
  const params = request.params as RawToolParams;
  const args = isRecord(params.arguments) ? params.arguments : {};
  try {
    if (params.name === "hashline.read") {
      const path = readString(args, "path");
      return path === undefined
        ? respondError(request.id, "missing_path")
        : respond(request.id, { content: await readHashlineFile(path) });
    }
    if (params.name === "hashline.apply_patch") {
      const path = readString(args, "path");
      const patchPath = readString(args, "patchPath");
      return path === undefined || patchPath === undefined
        ? respondError(request.id, "missing_path")
        : respond(request.id, await applyHashlinePatchFile(path, patchPath));
    }
    if (params.name === "hashline.verify") {
      const line = readString(args, "line");
      const expectedHash = readString(args, "expectedHash");
      return line === undefined || expectedHash === undefined
        ? respondError(request.id, "missing_hash")
        : respond(request.id, { ok: verifyHashlinePatch(line, expectedHash) });
    }
    return respondError(request.id, "tool_not_supported");
  } catch (error) {
    return respondError(request.id, error instanceof Error ? error.message : "hashline_failed");
  }
};

export const startHashlineMcpStdioServer = async (): Promise<void> => {
  let buffer = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) {
        const response = await handleHashlineMcpJsonRpc(JSON.parse(line));
        if (response !== undefined) {
          stdout.write(`${JSON.stringify(response)}\n`);
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
};
