import type { DeepSeekChatCompletion, DeepSeekChatRequest } from "./types.ts";

export type ProxyRequestContext = {
  readonly upstreamHeaders: Headers;
};

export type ChatCompletionProvider = (
  request: DeepSeekChatRequest,
  context: ProxyRequestContext,
) => DeepSeekChatCompletion | Promise<DeepSeekChatCompletion>;

export type ChatCompletionStreamProvider = (
  request: DeepSeekChatRequest,
  context: ProxyRequestContext,
) => Promise<string> | string;
