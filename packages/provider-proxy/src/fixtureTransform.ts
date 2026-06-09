import { readFileSync } from "node:fs";
import { z } from "zod";
import { convertChatCompletionToResponses } from "./chatToResponses.ts";
import { mapDeepSeekError } from "./errors.ts";
import { convertResponsesRequestToChat, ToolSchemaError } from "./responsesToChat.ts";
import { mapDeepSeekSseToResponsesEvents } from "./stream.ts";
import { deepSeekChatCompletionSchema, responsesRequestSchema } from "./types.ts";

const proxyFixtureSchema = z.object({
  chatCompletion: deepSeekChatCompletionSchema.optional(),
  request: responsesRequestSchema,
});

export type FixtureTransformResult =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly code: string; readonly message: string; readonly ok: false };

const reasoningErrorFixtureSchema = z.object({
  message: z.string(),
  reasoning_content: z.string().optional(),
  status: z.number().int(),
});

const readJsonFile = (fixturePath: string): unknown =>
  JSON.parse(readFileSync(fixturePath, "utf8"));

export const transformProxyFixtureFile = (fixturePath: string): FixtureTransformResult => {
  try {
    const fixture = proxyFixtureSchema.parse(readJsonFile(fixturePath));
    convertResponsesRequestToChat(fixture.request);

    if (fixture.chatCompletion === undefined) {
      return { lines: ["request.transformed"], ok: true };
    }

    const response = convertChatCompletionToResponses(fixture.chatCompletion);
    return {
      lines: [`response.${response.status}`, `output_text: ${response.output_text}`],
      ok: true,
    };
  } catch (error) {
    if (error instanceof ToolSchemaError) {
      return { code: error.code, message: error.reason, ok: false };
    }

    if (error instanceof SyntaxError) {
      return { code: "fixture_parse_error", message: error.message, ok: false };
    }

    if (error instanceof z.ZodError) {
      return { code: "fixture_schema_error", message: "fixture schema is invalid", ok: false };
    }

    throw error;
  }
};

export const transformStreamFixtureFile = (fixturePath: string): FixtureTransformResult => {
  const events = mapDeepSeekSseToResponsesEvents(readFileSync(fixturePath, "utf8"), {
    responseId: "resp_stream_fixture",
  });
  return { lines: events.map((event) => event.type), ok: true };
};

export const transformReasoningErrorFixtureFile = (fixturePath: string): FixtureTransformResult => {
  const fixture = reasoningErrorFixtureSchema.parse(readJsonFile(fixturePath));
  const mapped = mapDeepSeekError({ message: fixture.message, status: fixture.status });
  return { code: mapped.kind, message: mapped.message, ok: false };
};
