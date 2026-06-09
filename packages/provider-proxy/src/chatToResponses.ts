import { type NormalizedUsage, normalizeDeepSeekUsage } from "./cacheUsage.ts";
import {
  type DeepSeekChatCompletion,
  deepSeekChatCompletionSchema,
  deepSeekToolCallSchema,
} from "./types.ts";

export type ResponsesOutputItem =
  | {
      readonly content: readonly [{ readonly text: string; readonly type: "output_text" }];
      readonly role: "assistant";
      readonly type: "message";
    }
  | {
      readonly arguments: string;
      readonly call_id: string;
      readonly name: string;
      readonly type: "function_call";
    };

export type ResponsesObject = {
  readonly id: string;
  readonly model: string;
  readonly object: "response";
  readonly output: readonly ResponsesOutputItem[];
  readonly output_text: string;
  readonly status: "completed" | "failed" | "incomplete";
  readonly usage?: NormalizedUsage;
};

export type { DeepSeekChatCompletion };

const statusFromFinishReason = (
  finishReason: string | null | undefined,
): ResponsesObject["status"] => {
  if (finishReason === "length") return "incomplete";
  if (finishReason === "content_filter") return "failed";
  return "completed";
};

const outputItemsFromChoice = (
  choice: DeepSeekChatCompletion["choices"][number] | undefined,
): readonly ResponsesOutputItem[] => {
  if (choice === undefined) return [];

  const toolCalls = choice.message.tool_calls ?? [];
  if (toolCalls.length > 0) {
    return toolCalls.map((toolCall) => {
      const parsed = deepSeekToolCallSchema.parse(toolCall);
      return {
        arguments: parsed.function.arguments,
        call_id: parsed.id,
        name: parsed.function.name,
        type: "function_call",
      };
    });
  }

  if (choice.message.content === undefined || choice.message.content === null) return [];

  return [
    {
      content: [{ text: choice.message.content, type: "output_text" }],
      role: "assistant",
      type: "message",
    },
  ];
};

export const convertChatCompletionToResponses = (input: unknown): ResponsesObject => {
  const chatCompletion = deepSeekChatCompletionSchema.parse(input);
  const choice = chatCompletion.choices[0];
  const output = outputItemsFromChoice(choice);
  const outputText = output
    .filter((item) => item.type === "message")
    .map((item) => item.content.map((part) => part.text).join(""))
    .join("");
  const usage = normalizeDeepSeekUsage(chatCompletion.usage);

  return {
    id: `resp_${chatCompletion.id}`,
    model: chatCompletion.model,
    object: "response",
    output,
    output_text: outputText,
    status: statusFromFinishReason(choice?.finish_reason),
    ...(usage === undefined ? {} : { usage }),
  };
};
