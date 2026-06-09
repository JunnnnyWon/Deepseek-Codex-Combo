export { buildUpstreamHeaders, redactProxyLogValue } from "./auth.ts";
export type { ProxyBindInput, ValidatedProxyBindOptions } from "./bind.ts";
export { ProxyBindError, validateProxyBindOptions } from "./bind.ts";
export type {
  CacheComparison,
  CacheDiagnostics,
  CachePrefixChangeReason,
  CachePrefixShape,
  CacheUsageForDiagnostics,
} from "./cacheDiagnostics.ts";
export {
  CACHE_DIAGNOSTIC_REWRITE_VERSION,
  captureCachePrefixShape,
  compareCachePrefixShapes,
} from "./cacheDiagnostics.ts";
export type { NormalizedUsage } from "./cacheUsage.ts";
export { normalizeDeepSeekUsage } from "./cacheUsage.ts";
export type {
  DeepSeekChatCompletion,
  ResponsesObject,
  ResponsesOutputItem,
} from "./chatToResponses.ts";
export { convertChatCompletionToResponses } from "./chatToResponses.ts";
export type { DeepSeekProviderOptions } from "./deepseekProvider.ts";
export {
  createDeepSeekChatCompletionProvider,
  createDeepSeekModelListProvider,
  DeepSeekProviderError,
} from "./deepseekProvider.ts";
export type { CodexErrorKind, CodexFacingError, DeepSeekErrorInput } from "./errors.ts";
export { mapDeepSeekError } from "./errors.ts";
export type { FixtureTransformResult } from "./fixtureTransform.ts";
export {
  transformProxyFixtureFile,
  transformReasoningErrorFixtureFile,
  transformStreamFixtureFile,
} from "./fixtureTransform.ts";
export {
  createMockChatCompletionProvider,
  createMockChatCompletionStreamProvider,
} from "./mockUpstream.ts";
export type {
  ModelListCache,
  ModelListProvider,
  ModelListResponse,
  ProviderModel,
} from "./models.ts";
export { createModelListCache, localModelCatalog } from "./models.ts";
export type {
  ChatCompletionProvider,
  ChatCompletionStreamProvider,
  ProxyRequestContext,
} from "./providerTypes.ts";
export type {
  ReasoningReference,
  ReasoningStore,
  ReasoningStoreEntry,
  ReasoningStoreOptions,
  ReasoningStoreSnapshotEntry,
} from "./reasoningStore.ts";
export { createReasoningStore } from "./reasoningStore.ts";
export type {
  ResponsesRequest,
  ResponsesToChatResult,
  TransformWarning,
  TransformWarningCode,
} from "./responsesToChat.ts";
export {
  convertResponsesRequestToChat,
  ModelNotFoundError,
  ToolSchemaError,
} from "./responsesToChat.ts";
export type {
  JsonRepairInput,
  JsonRepairPlan,
  RetryInput,
  RetryPlan,
  RetryStreamInput,
  RetryStreamPlan,
  ToolCallLoopInput,
  ToolCallLoopPlan,
} from "./retry.ts";
export { planJsonRepair, planRetry, planStreamRetry, planToolCallLoop } from "./retry.ts";
export type {
  ProviderProxyAppOptions,
  ProviderProxyServer,
  ProviderProxyServerOptions,
  ProxyLogEntry,
} from "./server.ts";
export { createProviderProxyApp, startProviderProxyServer } from "./server.ts";
export type { ResponsesStreamEvent, StreamTransformOptions } from "./stream.ts";
export { formatResponsesSse, mapDeepSeekSseToResponsesEvents } from "./stream.ts";
export type { ToolContinuationInput, ToolContinuationMessage } from "./tools.ts";
export {
  buildToolContinuationMessages,
  summarizeToolContinuationForEvidence,
  ToolContinuationError,
} from "./tools.ts";

export const packageName = "@deepseek-codex-combo/provider-proxy";
