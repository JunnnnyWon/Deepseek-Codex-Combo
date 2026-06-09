import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ChatCompletionProvider, ChatCompletionStreamProvider } from "./providerTypes.ts";
import { type DeepSeekChatCompletion, deepSeekChatCompletionSchema } from "./types.ts";

const mockFixtureSchema = z.object({
  chatCompletion: deepSeekChatCompletionSchema,
});

const defaultProxyFixture = join("tests", "fixtures", "proxy", "text-response.json");

const resolveMockFixturePath = (mockUpstreamPath: string): string => {
  if (
    mockUpstreamPath.endsWith(".json") &&
    existsSync(mockUpstreamPath) &&
    statSync(mockUpstreamPath).isFile()
  ) {
    return mockUpstreamPath;
  }

  return defaultProxyFixture;
};

const resolveMockStreamFixturePath = (mockUpstreamPath: string): string | undefined => {
  if (
    mockUpstreamPath.endsWith(".sse") &&
    existsSync(mockUpstreamPath) &&
    statSync(mockUpstreamPath).isFile()
  ) {
    return mockUpstreamPath;
  }
  return undefined;
};

const chatCompletionToSse = (completion: DeepSeekChatCompletion): string => {
  const streamChoices = completion.choices.map((choice) => ({
    delta: {
      ...(choice.message.content === undefined || choice.message.content === null
        ? {}
        : { content: choice.message.content }),
      ...(choice.message.tool_calls === undefined ? {} : { tool_calls: choice.message.tool_calls }),
    },
    index: choice.index,
  }));
  const chunks: unknown[] = [{ choices: streamChoices, id: completion.id }];
  if (completion.usage !== undefined) {
    chunks.push({ choices: [], id: completion.id, usage: completion.usage });
  }

  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n`;
};

export const createMockChatCompletionProvider = (
  mockUpstreamPath: string,
): ChatCompletionProvider => {
  const fixturePath = resolveMockFixturePath(mockUpstreamPath);
  const fixture = mockFixtureSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));

  return () => fixture.chatCompletion;
};

export const createMockChatCompletionStreamProvider = (
  mockUpstreamPath: string,
): ChatCompletionStreamProvider | undefined => {
  const fixturePath = resolveMockStreamFixturePath(mockUpstreamPath);
  if (fixturePath !== undefined) {
    const fixture = readFileSync(fixturePath, "utf8");
    return () => fixture;
  }

  const jsonFixturePath = resolveMockFixturePath(mockUpstreamPath);
  const fixture = mockFixtureSchema.parse(JSON.parse(readFileSync(jsonFixturePath, "utf8")));
  const streamFixture = chatCompletionToSse(fixture.chatCompletion);
  return () => streamFixture;
};
