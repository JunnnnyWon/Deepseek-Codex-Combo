import type { ReasoningStore } from "./reasoningStore.ts";

export class ToolContinuationError extends Error {
  readonly name = "ToolContinuationError";
}

export type ToolContinuationInput = {
  readonly reasoningReference: string;
  readonly reasoningStore: ReasoningStore;
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly toolResult: string;
};

export type ToolContinuationMessage =
  | {
      readonly content: null;
      readonly reasoning_content: string;
      readonly role: "assistant";
      readonly tool_calls: readonly [
        {
          readonly function: { readonly arguments: string; readonly name: string };
          readonly id: string;
          readonly type: "function";
        },
      ];
    }
  | { readonly content: string; readonly role: "tool"; readonly tool_call_id: string };

export const buildToolContinuationMessages = (
  input: ToolContinuationInput,
): readonly ToolContinuationMessage[] => {
  const reasoningContent = input.reasoningStore.get({
    reference: input.reasoningReference,
    sessionId: input.sessionId,
  });

  if (reasoningContent === undefined) {
    throw new ToolContinuationError("reasoning continuation reference is missing or expired");
  }

  return [
    {
      content: null,
      reasoning_content: reasoningContent,
      role: "assistant",
      tool_calls: [
        {
          function: { arguments: "{}", name: input.toolName },
          id: input.toolCallId,
          type: "function",
        },
      ],
    },
    { content: input.toolResult, role: "tool", tool_call_id: input.toolCallId },
  ];
};

export const summarizeToolContinuationForEvidence = (
  messages: readonly ToolContinuationMessage[],
): string =>
  JSON.stringify(
    messages.map((message) => {
      if (message.role === "tool") {
        return { role: message.role, tool_call_id: message.tool_call_id };
      }
      return { has_reasoning: true, role: message.role, tool_call_id: message.tool_calls[0].id };
    }),
  );
