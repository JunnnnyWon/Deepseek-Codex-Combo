import { createHash } from "node:crypto";
import type { DeepSeekChatRequest } from "./types.ts";

export const CACHE_DIAGNOSTIC_REWRITE_VERSION = 1;

export type CacheComparison = "compared" | "first_observation" | "unavailable";
export type CachePrefixChangeReason = "rewrite" | "system" | "tools";

export type CachePrefixShape = {
  readonly prefix_hash: string;
  readonly rewrite_version: number;
  readonly system_hash: string;
  readonly tool_schema_tokens: number;
  readonly tools_hash: string;
};

export type CacheDiagnostics = {
  readonly comparison: CacheComparison;
  readonly prefix_changed: boolean;
  readonly prefix_change_reasons: readonly CachePrefixChangeReason[];
  readonly prefix_hash: string;
  readonly prompt_cache_hit_tokens: number;
  readonly prompt_cache_miss_tokens: number;
  readonly rewrite_version: number;
  readonly system_hash: string;
  readonly tool_schema_tokens: number;
  readonly tools_hash: string;
};

export type CacheUsageForDiagnostics = {
  readonly prompt_cache_hit_tokens?: number;
  readonly prompt_cache_miss_tokens?: number;
};

const shortHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  const stableRecord: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    stableRecord[key] = stableValue(value[key]);
  }
  return stableRecord;
};

const stableJson = (value: unknown): string => JSON.stringify(stableValue(value));

const collectSystemMessages = (request: DeepSeekChatRequest): readonly string[] =>
  request.messages.filter((message) => message.role === "system").map((message) => message.content);

export const captureCachePrefixShape = (chatRequest: DeepSeekChatRequest): CachePrefixShape => {
  const systemMessages = collectSystemMessages(chatRequest);
  const tools = chatRequest.tools ?? [];
  const toolsJson = stableJson(tools);
  const prefixJson = stableJson({
    rewrite_version: CACHE_DIAGNOSTIC_REWRITE_VERSION,
    system_messages: systemMessages,
    tools,
  });

  return {
    prefix_hash: shortHash(prefixJson),
    rewrite_version: CACHE_DIAGNOSTIC_REWRITE_VERSION,
    system_hash: shortHash(stableJson(systemMessages)),
    tool_schema_tokens: tools.length === 0 ? 0 : Math.floor(toolsJson.length / 4),
    tools_hash: shortHash(toolsJson),
  };
};

const usageTokens = (
  usage: CacheUsageForDiagnostics | null | undefined,
): Pick<CacheDiagnostics, "prompt_cache_hit_tokens" | "prompt_cache_miss_tokens"> => ({
  prompt_cache_hit_tokens: usage?.prompt_cache_hit_tokens ?? 0,
  prompt_cache_miss_tokens: usage?.prompt_cache_miss_tokens ?? 0,
});

const changeReasons = (
  previous: CachePrefixShape,
  current: CachePrefixShape,
): readonly CachePrefixChangeReason[] => {
  const reasons: CachePrefixChangeReason[] = [];
  if (previous.system_hash !== current.system_hash) reasons.push("system");
  if (previous.tools_hash !== current.tools_hash) reasons.push("tools");
  if (previous.rewrite_version !== current.rewrite_version) reasons.push("rewrite");
  return reasons;
};

export const compareCachePrefixShapes = (
  previous: CachePrefixShape | undefined,
  current: CachePrefixShape,
  usage?: CacheUsageForDiagnostics | null,
  comparison: CacheComparison = previous === undefined ? "first_observation" : "compared",
): CacheDiagnostics => {
  const reasons =
    previous === undefined || comparison !== "compared" ? [] : changeReasons(previous, current);

  return {
    comparison,
    prefix_hash: current.prefix_hash,
    system_hash: current.system_hash,
    tools_hash: current.tools_hash,
    rewrite_version: current.rewrite_version,
    tool_schema_tokens: current.tool_schema_tokens,
    prefix_changed: reasons.length > 0,
    prefix_change_reasons: reasons,
    ...usageTokens(usage),
  };
};
