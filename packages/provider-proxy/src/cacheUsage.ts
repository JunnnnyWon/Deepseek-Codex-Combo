import { z } from "zod";

export type NormalizedUsage = {
  readonly completion_tokens: number;
  readonly prompt_cache_hit_tokens: number;
  readonly prompt_cache_miss_tokens: number;
  readonly prompt_tokens: number;
  readonly reasoning_tokens: number;
  readonly total_tokens: number;
};

const tokenSchema = z.coerce.number().int().nonnegative().catch(0);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readToken = (source: Readonly<Record<string, unknown>>, key: string): number =>
  tokenSchema.parse(source[key]);

const readNestedToken = (
  source: Readonly<Record<string, unknown>>,
  objectKey: string,
  tokenKey: string,
): number => {
  const nested = source[objectKey];
  if (!isRecord(nested)) return 0;
  return readToken(nested, tokenKey);
};

export const normalizeDeepSeekUsage = (input: unknown): NormalizedUsage | undefined => {
  if (input === undefined || input === null) return undefined;

  const usage = isRecord(input) ? input : {};
  const promptTokens = readToken(usage, "prompt_tokens");
  const completionTokens = readToken(usage, "completion_tokens");
  const totalTokens = readToken(usage, "total_tokens");
  const topLevelHit = readToken(usage, "prompt_cache_hit_tokens");
  const nestedHit = readNestedToken(usage, "prompt_tokens_details", "cached_tokens");
  const promptCacheHitTokens = topLevelHit > 0 ? topLevelHit : nestedHit;
  const explicitMiss = readToken(usage, "prompt_cache_miss_tokens");
  const derivedMiss =
    promptCacheHitTokens > 0 ? Math.max(promptTokens - promptCacheHitTokens, 0) : 0;

  return {
    completion_tokens: completionTokens,
    prompt_cache_hit_tokens: promptCacheHitTokens,
    prompt_cache_miss_tokens: explicitMiss > 0 ? explicitMiss : derivedMiss,
    prompt_tokens: promptTokens,
    reasoning_tokens: readNestedToken(usage, "completion_tokens_details", "reasoning_tokens"),
    total_tokens: totalTokens,
  };
};
