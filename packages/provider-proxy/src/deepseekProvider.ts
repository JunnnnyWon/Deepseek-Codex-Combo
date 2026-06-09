import { z } from "zod";
import { redactProxyLogValue } from "./auth.ts";
import { type CodexErrorKind, mapDeepSeekError } from "./errors.ts";
import type { ProviderModel } from "./models.ts";
import type { ChatCompletionProvider, ProxyRequestContext } from "./providerTypes.ts";
import { planRetry } from "./retry.ts";
import {
  type DeepSeekChatCompletion,
  type DeepSeekChatRequest,
  deepSeekChatCompletionSchema,
} from "./types.ts";

export interface DeepSeekProviderOptions {
  readonly apiKey?: string;
  readonly baseDelayMs?: number;
  readonly baseUrl?: string;
  readonly chatPath?: string;
  readonly fetchImpl?: typeof fetch;
  readonly jitterRatio?: number;
  readonly maxAttempts?: number;
  readonly maxDelayMs?: number;
  readonly modelsPath?: string;
  readonly random?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly timeoutMs?: number;
}

export interface DeepSeekModelListProviderOptions
  extends Pick<
    DeepSeekProviderOptions,
    "apiKey" | "baseUrl" | "fetchImpl" | "modelsPath" | "timeoutMs"
  > {
  readonly upstreamHeaders?: Headers;
}

export class DeepSeekProviderError extends Error {
  readonly code: CodexErrorKind;
  readonly name = "DeepSeekProviderError";
  readonly retryable: boolean;
  readonly status: number;

  constructor(input: {
    readonly code: CodexErrorKind;
    readonly message: string;
    readonly retryable: boolean;
    readonly status: number;
  }) {
    super(input.message);
    this.code = input.code;
    this.retryable = input.retryable;
    this.status = input.status;
  }
}

const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      object: z.literal("model"),
      owned_by: z.literal("deepseek"),
    }),
  ),
  object: z.literal("list"),
});

const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
      .optional(),
    message: z.string().optional(),
  })
  .catchall(z.unknown());

const defaultBaseUrl = "https://api.deepseek.com";
const defaultChatPath = "/chat/completions";
const defaultModelsPath = "/models";

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const joinUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const sensitiveTerms = (headers: Headers): readonly string[] => {
  const authorization = headers.get("authorization");
  if (authorization === null || authorization.length === 0) {
    return [];
  }
  const bearerPrefix = "Bearer ";
  const token = authorization.startsWith(bearerPrefix)
    ? authorization.slice(bearerPrefix.length)
    : authorization;
  return [authorization, token];
};

const createHeaders = (contextHeaders: Headers, apiKey?: string): Headers => {
  const headers = new Headers(contextHeaders);
  headers.set("content-type", "application/json");
  if (!headers.has("authorization") && apiKey !== undefined && apiKey.length > 0) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }
  return headers;
};

const parseRetryAfterSeconds = (headers: Headers): number | undefined => {
  const value = headers.get("retry-after");
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.length === 0) {
    return {};
  }
  return JSON.parse(text);
};

const errorMessageFromBody = (
  body: unknown,
): { readonly code?: string; readonly message: string } => {
  const parsed = errorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { message: "upstream returned an error" };
  }
  return {
    ...(parsed.data.error?.code === undefined ? {} : { code: parsed.data.error.code }),
    message: parsed.data.error?.message ?? parsed.data.message ?? "upstream returned an error",
  };
};

const toProviderError = (
  response: Response,
  body: unknown,
  headers: Headers,
): DeepSeekProviderError => {
  const errorBody = errorMessageFromBody(body);
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
  const mapped = mapDeepSeekError({
    ...(errorBody.code === undefined ? {} : { code: errorBody.code }),
    message: redactProxyLogValue(errorBody.message, sensitiveTerms(headers)),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    status: response.status,
  });
  return new DeepSeekProviderError({
    code: mapped.kind,
    message: mapped.message,
    retryable: mapped.retryable,
    status: mapped.status,
  });
};

const fetchWithTimeout = (
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> =>
  fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });

const applyThinkingPolicy = (request: DeepSeekChatRequest): DeepSeekChatRequest => {
  if (request.thinking !== undefined) {
    return request;
  }
  return { ...request, thinking: { type: "disabled" } };
};

export const createDeepSeekChatCompletionProvider = (
  options: DeepSeekProviderOptions = {},
): ChatCompletionProvider => {
  const baseUrl = options.baseUrl ?? defaultBaseUrl;
  const chatPath = options.chatPath ?? defaultChatPath;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleep ?? defaultSleep;

  return async (
    request: DeepSeekChatRequest,
    context: ProxyRequestContext,
  ): Promise<DeepSeekChatCompletion> => {
    const headers = createHeaders(context.upstreamHeaders, options.apiKey);
    let attempt = 1;
    while (true) {
      const response = await fetchWithTimeout(
        fetchImpl,
        joinUrl(baseUrl, chatPath),
        {
          body: JSON.stringify(applyThinkingPolicy(request)),
          headers,
          method: "POST",
        },
        options.timeoutMs ?? 30_000,
      );
      const body = await parseJson(response);
      if (response.ok) {
        return deepSeekChatCompletionSchema.parse(body);
      }

      const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
      const retryAfterMs = retryAfterSeconds === undefined ? undefined : retryAfterSeconds * 1_000;
      const retry = planRetry({
        attempt,
        baseDelayMs: options.baseDelayMs ?? 250,
        jitterRatio: options.jitterRatio ?? 0,
        maxAttempts,
        maxDelayMs: options.maxDelayMs ?? 2_000,
        random: options.random ?? Math.random,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
        status: response.status,
      });
      if (retry.action === "give_up") {
        throw toProviderError(response, body, headers);
      }

      await sleep(retry.delayMs);
      attempt += 1;
    }
  };
};

export const createDeepSeekModelListProvider = (
  options: DeepSeekModelListProviderOptions = {},
): (() => Promise<readonly ProviderModel[]>) => {
  const baseUrl = options.baseUrl ?? defaultBaseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = createHeaders(options.upstreamHeaders ?? new Headers(), options.apiKey);

  return async (): Promise<readonly ProviderModel[]> => {
    const response = await fetchWithTimeout(
      fetchImpl,
      joinUrl(baseUrl, options.modelsPath ?? defaultModelsPath),
      { headers, method: "GET" },
      options.timeoutMs ?? 30_000,
    );
    const body = await parseJson(response);
    if (!response.ok) {
      throw toProviderError(response, body, headers);
    }
    return modelListSchema.parse(body).data;
  };
};
