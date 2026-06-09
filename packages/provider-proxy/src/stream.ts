import { z } from "zod";
import { type NormalizedUsage, normalizeDeepSeekUsage } from "./cacheUsage.ts";

export type ResponsesStreamEvent =
  | { readonly response_id: string; readonly type: "response.created" }
  | {
      readonly item:
        | {
            readonly content: readonly unknown[];
            readonly id: string;
            readonly role: "assistant";
            readonly status: "in_progress";
            readonly type: "message";
          }
        | {
            readonly arguments: string;
            readonly call_id: string;
            readonly id: string;
            readonly name: string;
            readonly status: "in_progress";
            readonly type: "function_call";
          };
      readonly output_index: number;
      readonly response_id: string;
      readonly type: "response.output_item.added";
    }
  | {
      readonly content_index: number;
      readonly item_id: string;
      readonly output_index: number;
      readonly part: { readonly text: string; readonly type: "output_text" };
      readonly response_id: string;
      readonly type: "response.content_part.added";
    }
  | {
      readonly content_index: number;
      readonly delta: string;
      readonly item_id: string;
      readonly output_index: number;
      readonly response_id: string;
      readonly type: "response.output_text.delta";
    }
  | {
      readonly content_index: number;
      readonly item_id: string;
      readonly output_index: number;
      readonly response_id: string;
      readonly text: string;
      readonly type: "response.output_text.done";
    }
  | {
      readonly content_index: number;
      readonly item_id: string;
      readonly output_index: number;
      readonly part: { readonly text: string; readonly type: "output_text" };
      readonly response_id: string;
      readonly type: "response.content_part.done";
    }
  | {
      readonly item_id: string;
      readonly output_index: number;
      readonly delta: string;
      readonly response_id: string;
      readonly type: "response.function_call_arguments.delta";
    }
  | {
      readonly arguments: string;
      readonly item_id: string;
      readonly output_index: number;
      readonly response_id: string;
      readonly type: "response.function_call_arguments.done";
    }
  | {
      readonly item:
        | {
            readonly content: readonly [{ readonly text: string; readonly type: "output_text" }];
            readonly id: string;
            readonly role: "assistant";
            readonly status: "completed";
            readonly type: "message";
          }
        | {
            readonly arguments: string;
            readonly call_id: string;
            readonly id: string;
            readonly name: string;
            readonly status: "completed";
            readonly type: "function_call";
          };
      readonly output_index: number;
      readonly response_id: string;
      readonly type: "response.output_item.done";
    }
  | {
      readonly response_id: string;
      readonly type: "response.usage";
      readonly usage: NormalizedUsage;
    }
  | {
      readonly response: {
        readonly id: string;
        readonly object: "response";
        readonly output: readonly unknown[];
        readonly status: "completed";
      };
      readonly response_id: string;
      readonly type: "response.completed";
    }
  | { readonly response_id: string; readonly type: "response.failed" };

export type StreamTransformOptions = {
  readonly responseId: string;
};

const toolCallDeltaSchema = z.object({
  function: z
    .object({
      arguments: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  id: z.string().optional(),
  type: z.literal("function").optional(),
});

const deepSeekStreamChoiceDeltaSchema = z.object({
  content: z.string().nullable().optional(),
  reasoning_content: z.string().nullable().optional(),
  tool_calls: z.array(toolCallDeltaSchema).optional(),
});

const deepSeekStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: deepSeekStreamChoiceDeltaSchema,
        finish_reason: z.string().nullable().optional(),
        index: z.number().int(),
      }),
    )
    .optional(),
  id: z.string().optional(),
  usage: z.unknown().optional(),
});

const deepSeekErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.string().optional(),
  }),
});

const isDoneMarker = (line: string): boolean => line === "[DONE]";

const dataLines = (sse: string): readonly string[] =>
  sse
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length).trim());

type ParsedChunk =
  | { readonly type: "error" }
  | { readonly type: "ignored" }
  | { readonly type: "usage"; readonly usage: NormalizedUsage }
  | {
      readonly delta: z.infer<typeof deepSeekStreamChoiceDeltaSchema>;
      readonly type: "choices";
    };

const parseChunk = (line: string): ParsedChunk => {
  try {
    const parsed = JSON.parse(line);
    if (deepSeekErrorSchema.safeParse(parsed).success) {
      return { type: "error" };
    }
    const choicesChunk = deepSeekStreamChunkSchema.parse(parsed);
    const usage = normalizeDeepSeekUsage(choicesChunk.usage);
    if (usage !== undefined && (choicesChunk.choices?.length ?? 0) === 0) {
      return { type: "usage", usage };
    }
    const choice = choicesChunk.choices?.[0];
    if (choice === undefined) {
      return { type: "ignored" };
    }
    return { type: "choices", delta: choice.delta };
  } catch {
    return { type: "error" };
  }
};

export const mapDeepSeekSseToResponsesEvents = (
  sse: string,
  options: StreamTransformOptions,
): readonly ResponsesStreamEvent[] => {
  const events: ResponsesStreamEvent[] = [
    { response_id: options.responseId, type: "response.created" },
  ];
  const messageItemId = "msg_0";
  const messageOutputIndex = 0;
  const textContentIndex = 0;
  const toolOutputIndex = 0;
  let text = "";
  let textOpen = false;
  let textDone = false;
  let toolOpen = false;
  let toolDone = false;
  let toolArguments = "";
  let toolId = "call_0";
  let toolName = "";
  let failed = false;

  const closeTextIfNeeded = (): void => {
    if (textOpen && !textDone) {
      events.push({
        content_index: textContentIndex,
        item_id: messageItemId,
        output_index: messageOutputIndex,
        response_id: options.responseId,
        text,
        type: "response.output_text.done",
      });
      events.push({
        content_index: textContentIndex,
        item_id: messageItemId,
        output_index: messageOutputIndex,
        part: { text, type: "output_text" },
        response_id: options.responseId,
        type: "response.content_part.done",
      });
      events.push({
        item: {
          content: [{ text, type: "output_text" }],
          id: messageItemId,
          role: "assistant",
          status: "completed",
          type: "message",
        },
        output_index: messageOutputIndex,
        response_id: options.responseId,
        type: "response.output_item.done",
      });
      textDone = true;
    }
  };

  const closeToolIfNeeded = (): void => {
    if (toolOpen && !toolDone) {
      events.push({
        arguments: toolArguments,
        item_id: toolId,
        output_index: toolOutputIndex,
        response_id: options.responseId,
        type: "response.function_call_arguments.done",
      });
      events.push({
        item: {
          arguments: toolArguments,
          call_id: toolId,
          id: toolId,
          name: toolName,
          status: "completed",
          type: "function_call",
        },
        output_index: toolOutputIndex,
        response_id: options.responseId,
        type: "response.output_item.done",
      });
      toolDone = true;
    }
  };

  const completedEvent = (): ResponsesStreamEvent => ({
    response: {
      id: options.responseId,
      object: "response",
      output: [
        ...(textDone
          ? [
              {
                content: [{ text, type: "output_text" }],
                id: messageItemId,
                role: "assistant",
                status: "completed",
                type: "message",
              },
            ]
          : []),
        ...(toolDone
          ? [
              {
                arguments: toolArguments,
                call_id: toolId,
                id: toolId,
                name: toolName,
                status: "completed",
                type: "function_call",
              },
            ]
          : []),
      ],
      status: "completed",
    },
    response_id: options.responseId,
    type: "response.completed",
  });

  for (const line of dataLines(sse)) {
    if (isDoneMarker(line)) {
      if (!textDone) closeTextIfNeeded();
      closeToolIfNeeded();
      if (!failed) {
        events.push(completedEvent());
      }
      continue;
    }

    const parsed = parseChunk(line);
    if (parsed.type === "ignored") {
      continue;
    }
    if (parsed.type === "usage") {
      events.push({
        response_id: options.responseId,
        type: "response.usage",
        usage: parsed.usage,
      });
      continue;
    }

    if (parsed.type === "error") {
      if (!textDone) closeTextIfNeeded();
      closeToolIfNeeded();
      events.push({ response_id: options.responseId, type: "response.failed" });
      failed = true;
      continue;
    }

    const delta = parsed.delta;

    if (delta.content !== undefined && delta.content !== null && !textDone && !toolOpen) {
      if (!textOpen) {
        events.push({
          item: {
            content: [],
            id: messageItemId,
            role: "assistant",
            status: "in_progress",
            type: "message",
          },
          output_index: messageOutputIndex,
          response_id: options.responseId,
          type: "response.output_item.added",
        });
        events.push({
          content_index: textContentIndex,
          item_id: messageItemId,
          output_index: messageOutputIndex,
          part: { text: "", type: "output_text" },
          response_id: options.responseId,
          type: "response.content_part.added",
        });
        textOpen = true;
      }
      text += delta.content;
      events.push({
        content_index: textContentIndex,
        delta: delta.content,
        item_id: messageItemId,
        output_index: messageOutputIndex,
        response_id: options.responseId,
        type: "response.output_text.delta",
      });
    }

    const toolCalls = delta.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      if (textOpen && !textDone) {
        closeTextIfNeeded();
      }
      if (!toolOpen) {
        toolId = toolCall.id ?? toolId;
        toolName = toolCall.function?.name ?? toolName;
        events.push({
          item: {
            arguments: "",
            call_id: toolId,
            id: toolId,
            name: toolName,
            status: "in_progress",
            type: "function_call",
          },
          output_index: toolOutputIndex,
          response_id: options.responseId,
          type: "response.output_item.added",
        });
        toolOpen = true;
      }
      if (toolCall.function?.arguments !== undefined) {
        toolArguments += toolCall.function.arguments;
        events.push({
          delta: toolCall.function.arguments,
          item_id: toolId,
          output_index: toolOutputIndex,
          response_id: options.responseId,
          type: "response.function_call_arguments.delta",
        });
      }
    }
  }

  if (!failed) {
    closeTextIfNeeded();
    closeToolIfNeeded();
  }

  if (failed) {
    return events;
  }

  if (events.at(-1)?.type !== "response.completed") {
    events.push(completedEvent());
  }

  return events;
};

export const formatResponsesSse = (events: readonly ResponsesStreamEvent[]): string =>
  events
    .map(
      (event, index) =>
        `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: index })}\n\n`,
    )
    .join("");
