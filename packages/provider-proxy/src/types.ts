import { z } from "zod";

export const reasoningEffortSchema = z.union([
  z.literal("low"),
  z.literal("medium"),
  z.literal("high"),
  z.literal("xhigh"),
  z.literal("max"),
]);

export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;

export const responsesMessageRoleSchema = z.union([
  z.literal("user"),
  z.literal("assistant"),
  z.literal("system"),
  z.literal("developer"),
]);

export type ResponsesMessageRole = z.infer<typeof responsesMessageRoleSchema>;

const inputTextPartSchema = z.object({
  text: z.string(),
  type: z.union([z.literal("input_text"), z.literal("output_text")]),
});

export const responsesInputItemSchema = z.discriminatedUnion("type", [
  z.object({
    content: z.union([z.string(), z.array(inputTextPartSchema)]),
    role: responsesMessageRoleSchema,
    type: z.literal("message"),
  }),
  z.object({
    arguments: z.string(),
    call_id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal("function_call"),
  }),
  z.object({
    call_id: z.string().min(1),
    output: z.string(),
    type: z.literal("function_call_output"),
  }),
]);

export type ResponsesInputItem = z.infer<typeof responsesInputItemSchema>;

export const responsesRequestSchema = z
  .object({
    input: z.union([z.string(), z.array(responsesInputItemSchema)]),
    instructions: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    model: z.string().min(1),
    parallel_tool_calls: z.boolean().optional(),
    reasoning: z.object({ effort: reasoningEffortSchema.optional() }).nullable().optional(),
    reasoning_effort: reasoningEffortSchema.optional(),
    stream: z.boolean().optional(),
    temperature: z.number().optional(),
    tool_choice: z.unknown().optional(),
    tools: z.array(z.unknown()).optional(),
    top_p: z.number().optional(),
  })
  .catchall(z.unknown());

export type ResponsesRequest = z.infer<typeof responsesRequestSchema>;

export type DeepSeekToolCall = {
  readonly function: {
    readonly arguments: string;
    readonly name: string;
  };
  readonly id: string;
  readonly type: "function";
};

export type DeepSeekMessage =
  | { readonly content: string; readonly role: "system" | "user" }
  | {
      readonly content: string;
      readonly role: "assistant";
      readonly tool_calls?: readonly DeepSeekToolCall[];
    }
  | { readonly content: string; readonly role: "tool"; readonly tool_call_id: string };

export type DeepSeekTool = {
  readonly function: {
    readonly description?: string;
    readonly name: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
  readonly type: "function";
};

export type DeepSeekChatRequest = {
  readonly messages: readonly DeepSeekMessage[];
  readonly model: string;
  readonly reasoning_effort?: "high" | "max";
  readonly stream?: boolean;
  readonly temperature?: number;
  readonly thinking?: { readonly type: "disabled" | "enabled" };
  readonly tool_choice?: unknown;
  readonly tools?: readonly DeepSeekTool[];
  readonly top_p?: number;
};

export const deepSeekToolCallSchema = z.object({
  function: z.object({
    arguments: z.string(),
    name: z.string().min(1),
  }),
  id: z.string().min(1),
  type: z.literal("function"),
});

export const deepSeekChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullable().optional(),
      index: z.number().int(),
      message: z.object({
        content: z.string().nullable().optional(),
        role: z.literal("assistant"),
        tool_calls: z.array(deepSeekToolCallSchema).optional(),
      }),
    }),
  ),
  id: z.string().min(1),
  model: z.string().min(1),
  object: z.literal("chat.completion"),
  usage: z.unknown().optional(),
});

export type DeepSeekChatCompletion = z.infer<typeof deepSeekChatCompletionSchema>;
