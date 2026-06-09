import { redactProxyLogValue } from "./auth.ts";
import { DeepSeekProviderError, type DeepSeekProviderOptions } from "./deepseekProvider.ts";
import { mapDeepSeekError } from "./errors.ts";
import type { ChatCompletionStreamProvider, ProxyRequestContext } from "./providerTypes.ts";
import type { DeepSeekChatRequest } from "./types.ts";

const defaultBaseUrl = "https://api.deepseek.com";
const defaultChatPath = "/chat/completions";

const joinUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const createHeaders = (contextHeaders: Headers, apiKey?: string): Headers => {
  const headers = new Headers(contextHeaders);
  headers.set("content-type", "application/json");
  if (!headers.has("authorization") && apiKey !== undefined && apiKey.length > 0) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }
  return headers;
};

const sensitiveTerms = (headers: Headers): readonly string[] => {
  const authorization = headers.get("authorization");
  if (authorization === null || authorization.length === 0) {
    return [];
  }
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : authorization;
  return [authorization, token];
};

const applyStreamPolicy = (request: DeepSeekChatRequest): DeepSeekChatRequest => ({
  ...request,
  stream: true,
  ...(request.thinking === undefined ? { thinking: { type: "disabled" as const } } : {}),
});

const toStreamProviderError = async (
  response: Response,
  headers: Headers,
): Promise<DeepSeekProviderError> => {
  const message = redactProxyLogValue(await response.text(), sensitiveTerms(headers));
  const mapped = mapDeepSeekError({
    message: message.length === 0 ? "stream upstream error" : message,
    status: response.status,
  });
  return new DeepSeekProviderError({
    code: mapped.kind,
    message: mapped.message,
    retryable: mapped.retryable,
    status: mapped.status,
  });
};

export const createDeepSeekChatCompletionStreamProvider = (
  options: DeepSeekProviderOptions = {},
): ChatCompletionStreamProvider => {
  const baseUrl = options.baseUrl ?? defaultBaseUrl;
  const chatPath = options.chatPath ?? defaultChatPath;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request: DeepSeekChatRequest, context: ProxyRequestContext): Promise<string> => {
    const headers = createHeaders(context.upstreamHeaders, options.apiKey);
    const response = await fetchImpl(joinUrl(baseUrl, chatPath), {
      body: JSON.stringify({
        ...applyStreamPolicy(request),
        stream_options: { include_usage: true },
      }),
      headers,
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      throw await toStreamProviderError(response, headers);
    }
    return await response.text();
  };
};
