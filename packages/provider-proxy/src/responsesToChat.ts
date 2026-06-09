import { z } from "zod";
import {
  type DeepSeekChatRequest,
  type DeepSeekMessage,
  type DeepSeekTool,
  type ReasoningEffort,
  type ResponsesInputItem,
  type ResponsesRequest,
  responsesRequestSchema,
} from "./types.ts";

export class ToolSchemaError extends Error {
  readonly code = "tool_schema_error";
  readonly name = "ToolSchemaError";
  readonly reason: string;

  constructor(reason: string) {
    super(`tool_schema_error: ${reason}`);
    this.reason = reason;
  }
}

export class ModelNotFoundError extends Error {
  readonly code = "model_not_found";
  readonly name = "ModelNotFoundError";
  readonly model: string;

  constructor(model: string) {
    super(`model_not_found: ${model}`);
    this.model = model;
  }
}

export type TransformWarningCode =
  | "temperature_dropped_for_thinking"
  | "top_p_dropped_for_thinking"
  | "parallel_tool_calls_dropped"
  | "unsupported_parameter_dropped"
  | "unsupported_tool_dropped";

export type TransformWarning = {
  readonly code: TransformWarningCode;
  readonly field: string;
};

export type ResponsesToChatResult = {
  readonly chatRequest: DeepSeekChatRequest;
  readonly warnings: readonly TransformWarning[];
};

export type { ResponsesRequest };

const modelAliases = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
} as const;

const supportedFields = new Set([
  "input",
  "instructions",
  "metadata",
  "model",
  "parallel_tool_calls",
  "reasoning",
  "reasoning_effort",
  "stream",
  "temperature",
  "tool_choice",
  "tools",
  "top_p",
]);

const toolSchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
  strict: z.boolean().optional(),
  type: z.literal("function"),
});

const jsonSchemaTypeKey = "type";

const normalizeModel = (model: string): string => {
  if (model === "deepseek-chat" || model === "deepseek-reasoner") {
    return modelAliases[model];
  }

  if (model === "deepseek-v4-flash" || model === "deepseek-v4-pro") return model;

  throw new ModelNotFoundError(model);
};

const mapReasoningEffort = (effort: ReasoningEffort | undefined): "high" | "max" | undefined => {
  if (effort === undefined) return undefined;

  switch (effort) {
    case "xhigh":
    case "max":
      return "max";
    case "low":
    case "medium":
    case "high":
      return "high";
    default:
      return assertNever(effort);
  }
};

const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${String(value)}`);
};

const inputContentToText = (
  content: Extract<ResponsesInputItem, { readonly type: "message" }>["content"],
): string => {
  if (typeof content === "string") return content;
  return content.map((part) => part.text).join("");
};

type DeepSeekInputMessageRole = "assistant" | "system" | "user";

const mapMessageRole = (
  role: Extract<ResponsesInputItem, { readonly type: "message" }>["role"],
): DeepSeekInputMessageRole => {
  switch (role) {
    case "developer":
    case "system":
      return "system";
    case "assistant":
      return "assistant";
    case "user":
      return "user";
    default:
      return assertNever(role);
  }
};

const convertInputArrayItem = (item: ResponsesInputItem): readonly DeepSeekMessage[] => {
  switch (item.type) {
    case "message":
      return [{ content: inputContentToText(item.content), role: mapMessageRole(item.role) }];
    case "function_call":
      return [
        {
          content: "",
          role: "assistant",
          tool_calls: [
            {
              function: { arguments: item.arguments, name: item.name },
              id: item.call_id,
              type: "function",
            },
          ],
        },
      ];
    case "function_call_output":
      return [{ content: item.output, role: "tool", tool_call_id: item.call_id }];
    default:
      return assertNever(item);
  }
};

const buildMessages = (request: ResponsesRequest): readonly DeepSeekMessage[] => {
  const instructionMessages =
    request.instructions === undefined
      ? []
      : [{ content: request.instructions, role: "system" as const }];

  if (typeof request.input === "string") {
    return [...instructionMessages, { content: request.input, role: "user" }];
  }

  return [...instructionMessages, ...request.input.flatMap(convertInputArrayItem)];
};

const validateToolParameters = (parameters: Readonly<Record<string, unknown>>): void => {
  if (parameters[jsonSchemaTypeKey] !== "object") {
    throw new ToolSchemaError("function parameters must be a JSON object schema");
  }
};

const convertTool = (tool: unknown): DeepSeekTool => {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success) {
    throw new ToolSchemaError("function tool must include type, name, and parameters");
  }

  validateToolParameters(parsed.data.parameters);
  return {
    function: {
      ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
      name: parsed.data.name,
      parameters: parsed.data.parameters,
    },
    type: "function",
  };
};

const isUnsupportedToolRecord = (
  tool: unknown,
): tool is Readonly<Record<string, unknown> & { type?: unknown }> =>
  typeof tool === "object" && tool !== null && !Array.isArray(tool);

const convertTools = (
  tools: readonly unknown[] | undefined,
  warnings: TransformWarning[],
): readonly DeepSeekTool[] | undefined => {
  if (tools === undefined) {
    return undefined;
  }

  const converted: DeepSeekTool[] = [];
  for (const tool of tools) {
    if (isUnsupportedToolRecord(tool) && tool.type !== "function") {
      warnings.push({ code: "unsupported_tool_dropped", field: String(tool.type ?? "unknown") });
      continue;
    }
    converted.push(convertTool(tool));
  }

  return converted.length === 0 ? undefined : converted;
};

const collectUnsupportedWarnings = (input: ResponsesRequest): readonly TransformWarning[] =>
  Object.keys(input)
    .filter((field) => !supportedFields.has(field))
    .map((field) => ({ code: "unsupported_parameter_dropped", field }));

export const convertResponsesRequestToChat = (input: unknown): ResponsesToChatResult => {
  const request = responsesRequestSchema.parse(input);
  const reasoningEffort = mapReasoningEffort(request.reasoning?.effort ?? request.reasoning_effort);
  const warnings: TransformWarning[] = [...collectUnsupportedWarnings(request)];

  const samplingOptions =
    reasoningEffort === undefined
      ? {
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.top_p === undefined ? {} : { top_p: request.top_p }),
        }
      : {};

  if (reasoningEffort !== undefined && request.temperature !== undefined) {
    warnings.push({ code: "temperature_dropped_for_thinking", field: "temperature" });
  }

  if (reasoningEffort !== undefined && request.top_p !== undefined) {
    warnings.push({ code: "top_p_dropped_for_thinking", field: "top_p" });
  }

  if (request.parallel_tool_calls !== undefined) {
    warnings.push({ code: "parallel_tool_calls_dropped", field: "parallel_tool_calls" });
  }

  const tools = convertTools(request.tools, warnings);

  return {
    chatRequest: {
      messages: buildMessages(request),
      model: normalizeModel(request.model),
      ...samplingOptions,
      ...(request.stream === undefined ? {} : { stream: request.stream }),
      ...(reasoningEffort === undefined
        ? { thinking: { type: "disabled" as const } }
        : { reasoning_effort: reasoningEffort, thinking: { type: "enabled" as const } }),
      ...(request.tool_choice === undefined ? {} : { tool_choice: request.tool_choice }),
      ...(tools === undefined ? {} : { tools }),
    },
    warnings,
  };
};
