import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import { createBoundedStore } from "../../shared/src/bounded-store.ts";
import { buildUpstreamHeaders, redactProxyLogValue } from "./auth.ts";
import {
  type ProxyBindInput,
  type ValidatedProxyBindOptions,
  validateProxyBindOptions,
} from "./bind.ts";
import {
  type CacheDiagnostics,
  type CachePrefixShape,
  captureCachePrefixShape,
  compareCachePrefixShapes,
} from "./cacheDiagnostics.ts";
import type { NormalizedUsage } from "./cacheUsage.ts";
import { convertChatCompletionToResponses } from "./chatToResponses.ts";
import { DeepSeekProviderError } from "./deepseekProvider.ts";
import {
  createModelListCache,
  localModelCatalog,
  type ModelListProvider,
  type ModelListResponse,
} from "./models.ts";
import type { ChatCompletionProvider, ChatCompletionStreamProvider } from "./providerTypes.ts";
import { convertResponsesRequestToChat, ToolSchemaError } from "./responsesToChat.ts";
import { formatResponsesSse, mapDeepSeekSseToResponsesEvents } from "./stream.ts";

export type {
  ChatCompletionProvider,
  ChatCompletionStreamProvider,
  ProxyRequestContext,
} from "./providerTypes.ts";

export type ProxyLogEntry = {
  readonly cache_diagnostics?: CacheDiagnostics;
  readonly detail?: string;
  readonly event: string;
  readonly level: "error" | "info" | "warn";
  readonly usage?: NormalizedUsage;
};

export type ProviderProxyAppOptions = {
  readonly chatCompletionProvider?: ChatCompletionProvider;
  readonly chatCompletionStreamProvider?: ChatCompletionStreamProvider;
  readonly enableMetrics?: boolean;
  readonly logSink?: (entry: ProxyLogEntry) => void;
  readonly maxConcurrency?: number;
  readonly maxRequestBodyBytes?: number;
  readonly modelsProvider?: ModelListProvider;
};

export type ProviderProxyServerOptions = ProviderProxyAppOptions &
  ProxyBindInput & {
    readonly onListening?: (bind: ValidatedProxyBindOptions) => void;
  };

export type ProviderProxyServer = {
  readonly bind: ValidatedProxyBindOptions;
  readonly close: () => Promise<void>;
};

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const providerErrorStatus = (status: number): 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503 => {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 429:
    case 500:
    case 502:
    case 503:
      return status;
    default:
      return 500;
  }
};

const readJsonBody = async (request: Request, maxBytes: number): Promise<unknown> => {
  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > maxBytes) {
    throw new Error("request_body_too_large");
  }

  return JSON.parse(bodyText);
};

const createLogger = (logSink: ProviderProxyAppOptions["logSink"], headers: Headers) => {
  const authorization = headers.get("authorization") ?? "";
  return (entry: ProxyLogEntry): void => {
    const detail =
      entry.detail === undefined
        ? {}
        : { detail: redactProxyLogValue(entry.detail, [authorization]) };
    logSink?.({ event: entry.event, level: entry.level, ...detail });
  };
};

const modelIds = (models: ModelListResponse): readonly string[] =>
  models.data.map((model) => model.id);

const cacheStoreKey = "prefix";
const dccCacheSessionIdKey = "dcc_cache_session_id";
const metadataKey = "metadata";
const sessionIdKey = "session_id";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const cacheSessionIdFromRequest = (requestBody: unknown, headers: Headers): string | undefined => {
  const metadata =
    isRecord(requestBody) && isRecord(requestBody[metadataKey])
      ? requestBody[metadataKey]
      : undefined;
  return (
    nonEmptyString(metadata?.[dccCacheSessionIdKey]) ??
    nonEmptyString(metadata?.[sessionIdKey]) ??
    nonEmptyString(headers.get("x-dcc-cache-session-id"))
  );
};

export const createProviderProxyApp = (options: ProviderProxyAppOptions = {}): Hono => {
  const app = new Hono();
  const modelCache = createModelListCache();
  const cachePrefixStore = createBoundedStore<CachePrefixShape>({
    maxEntriesPerSession: 1,
    ttlMs: 6 * 60 * 60 * 1_000,
  });
  const maxConcurrency = options.maxConcurrency ?? 16;
  const maxRequestBodyBytes = options.maxRequestBodyBytes ?? 1_048_576;
  let activeRequests = 0;

  app.get("/healthz", (context) =>
    context.json({
      models: modelIds({ data: localModelCatalog, object: "list", source: "local" }),
      ok: true,
      service: "dcc-provider-proxy",
      version: "0.1.0",
    }),
  );

  app.get("/v1/models", async (context) =>
    context.json(await modelCache.getModels(options.modelsProvider)),
  );

  app.post("/v1/responses", async (context) => {
    if (activeRequests >= maxConcurrency) {
      return context.json(errorBody("concurrency_limit_exceeded", "too many active requests"), 429);
    }

    activeRequests += 1;
    const upstreamHeaders = buildUpstreamHeaders(context.req.raw.headers);
    const log = createLogger(options.logSink, upstreamHeaders);

    try {
      const requestBody = await readJsonBody(context.req.raw, maxRequestBodyBytes);
      const transformed = convertResponsesRequestToChat(requestBody);
      const cacheSessionId = cacheSessionIdFromRequest(requestBody, context.req.raw.headers);
      const cachePrefixShape = captureCachePrefixShape(transformed.chatRequest);
      if (transformed.chatRequest.stream === true) {
        if (options.chatCompletionStreamProvider === undefined) {
          return context.json(errorBody("upstream_required", "stream provider missing"), 503);
        }
        const rawSse = await options.chatCompletionStreamProvider(transformed.chatRequest, {
          upstreamHeaders,
        });
        const events = mapDeepSeekSseToResponsesEvents(rawSse, { responseId: "resp_stream" });
        return context.text(formatResponsesSse(events), 200, {
          "content-type": "text/event-stream",
        });
      }
      if (options.chatCompletionProvider === undefined) {
        return context.json(
          errorBody("upstream_required", "chat completion provider missing"),
          503,
        );
      }
      const previousCachePrefixShape =
        cacheSessionId === undefined
          ? undefined
          : cachePrefixStore.get(cacheSessionId, cacheStoreKey);
      const chatCompletion = await options.chatCompletionProvider(transformed.chatRequest, {
        upstreamHeaders,
      });
      const response = convertChatCompletionToResponses(chatCompletion);
      const cacheDiagnostics = compareCachePrefixShapes(
        previousCachePrefixShape,
        cachePrefixShape,
        response.usage,
        cacheSessionId === undefined ? "unavailable" : undefined,
      );
      if (cacheSessionId !== undefined) {
        cachePrefixStore.set(cacheSessionId, cacheStoreKey, cachePrefixShape);
      }
      log({
        cache_diagnostics: cacheDiagnostics,
        detail: upstreamHeaders.get("authorization") ?? "",
        event: "response_completed",
        level: "info",
        ...(response.usage === undefined ? {} : { usage: response.usage }),
      });

      return context.json({
        ...response,
        cache_diagnostics: cacheDiagnostics,
        status_event: `response.${response.status}`,
      });
    } catch (error) {
      if (error instanceof ToolSchemaError) {
        return context.json(errorBody(error.code, error.reason), 400);
      }

      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        return context.json(errorBody("request_invalid", "request JSON is invalid"), 400);
      }

      if (error instanceof DeepSeekProviderError) {
        return context.json(
          errorBody(error.code, error.message),
          providerErrorStatus(error.status),
        );
      }

      const message = error instanceof Error ? error.message : "unknown proxy error";
      const status = message === "request_body_too_large" ? 413 : 500;
      return context.json(errorBody("proxy_error", message), status);
    } finally {
      activeRequests -= 1;
    }
  });

  app.post("/v1/chat/completions", (context) =>
    context.json(
      errorBody("unsupported_endpoint", "use POST /v1/responses for DeepSeek-Codex-Combo"),
      501,
    ),
  );

  app.get("/metrics", (context) => {
    if (options.enableMetrics !== true) {
      return context.json(errorBody("metrics_disabled", "metrics are disabled"), 404);
    }

    return context.text(`dcc_provider_proxy_active_requests ${activeRequests}\n`);
  });

  return app;
};

export const startProviderProxyServer = (
  options: ProviderProxyServerOptions = {},
): ProviderProxyServer => {
  const bind = validateProxyBindOptions(options);
  const app = createProviderProxyApp(options);
  const server: ServerType = serve({ fetch: app.fetch, hostname: bind.host, port: bind.port }, () =>
    options.onListening?.(bind),
  );

  return {
    bind,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
};
