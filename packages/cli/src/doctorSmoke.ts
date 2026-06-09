import {
  createDeepSeekChatCompletionProvider,
  createDeepSeekModelListProvider,
} from "../../provider-proxy/src/deepseekProvider.ts";

export type ProxyEndpoint = {
  readonly host: string;
  readonly port: number;
};

export type ProxySmokeResult = {
  readonly cacheDiagnosticsOk: boolean;
  readonly responsesOk: boolean;
};

const smokeSentinel = ["DCC", "SMOKE", "OK"].join("_");
const smokePrompt = `Reply exactly ${smokeSentinel}.`;
const cacheDiagnosticsKey = "cache_diagnostics";
const comparisonKey = "comparison";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasCacheDiagnostics = (body: unknown): boolean => {
  if (!isRecord(body)) {
    return false;
  }
  const diagnostics = body[cacheDiagnosticsKey];
  return isRecord(diagnostics) && typeof diagnostics[comparisonKey] === "string";
};

export const runLiveDeepSeekSmoke = async (options: {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs: number;
}): Promise<readonly string[]> => {
  const providerOptions = {
    apiKey: options.apiKey,
    maxAttempts: 1,
    timeoutMs: options.timeoutMs,
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  };
  const modelsProvider = createDeepSeekModelListProvider(providerOptions);
  await modelsProvider();
  const chatProvider = createDeepSeekChatCompletionProvider(providerOptions);
  const completion = await chatProvider(
    {
      messages: [{ content: smokePrompt, role: "user" }],
      model: "deepseek-v4-flash",
      temperature: 0,
    },
    { upstreamHeaders: new Headers() },
  );
  const content = completion.choices[0]?.message.content ?? "";
  if (!content.includes(smokeSentinel)) {
    return ["Live: models ok", "model smoke failure: deepseek-v4-flash"];
  }
  return ["Live: models ok", "Live: chat smoke ok"];
};

export const runProxySmoke = async (input: {
  readonly apiKey: string;
  readonly endpoint: ProxyEndpoint;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
}): Promise<ProxySmokeResult> => {
  const response = await input.fetchImpl(
    `http://${input.endpoint.host}:${input.endpoint.port}/v1/responses`,
    {
      body: JSON.stringify({
        input: smokePrompt,
        metadata: { dcc_cache_session_id: "dcc-doctor-smoke" },
        model: "deepseek-v4-flash",
      }),
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(input.timeoutMs),
    },
  );
  if (!response.ok) {
    return { cacheDiagnosticsOk: false, responsesOk: false };
  }
  const body: unknown = await response.json();
  return { cacheDiagnosticsOk: hasCacheDiagnostics(body), responsesOk: isRecord(body) };
};
