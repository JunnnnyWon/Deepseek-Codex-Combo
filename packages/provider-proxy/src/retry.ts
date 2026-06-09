export type RetryInput = {
  readonly attempt: number;
  readonly baseDelayMs: number;
  readonly jitterRatio: number;
  readonly maxAttempts: number;
  readonly maxDelayMs: number;
  readonly random: () => number;
  readonly retryAfterMs?: number;
  readonly status: number;
};

export type RetryPlan =
  | { readonly action: "give_up"; readonly reason: "attempt_cap" | "not_retryable" }
  | {
      readonly action: "retry";
      readonly delayMs: number;
      readonly reason: "rate_limit" | "upstream";
    };

export type RetryStreamInput = {
  readonly attempt: number;
  readonly baseDelayMs: number;
  readonly jitterRatio: number;
  readonly maxAttempts: number;
  readonly maxDelayMs: number;
  readonly random: () => number;
  readonly retryAfterMs?: number;
};

export type RetryStreamPlan =
  | { readonly action: "give_up"; readonly reason: "attempt_cap" }
  | { readonly action: "retry"; readonly delayMs: number; readonly reason: "stream_interruption" };

export type JsonRepairInput = {
  readonly attempts: number;
  readonly maxAttempts: number;
};

export type JsonRepairPlan = {
  readonly action: "retry" | "give_up";
  readonly reason: "json_repair" | "attempt_cap";
};

export type ToolCallLoopInput = {
  readonly attempt: number;
  readonly maxAttempts: number;
};

export type ToolCallLoopPlan = {
  readonly action: "retry" | "handoff";
  readonly reason: "tool_call_loop";
};

type RetryableReason = Extract<RetryPlan, { readonly action: "retry" }>["reason"];

const assertPositiveInteger = (value: number, fieldName: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${fieldName} must be a positive integer`);
  }
};

const assertRetryWindow = (attempt: number, maxAttempts: number): void => {
  assertPositiveInteger(attempt, "attempt");
  assertPositiveInteger(maxAttempts, "maxAttempts");
};

const retryReason = (status: number): RetryableReason | undefined => {
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  return undefined;
};

export const planRetry = (input: RetryInput): RetryPlan => {
  assertRetryWindow(input.attempt, input.maxAttempts);
  const reason = retryReason(input.status);
  if (reason === undefined) return { action: "give_up", reason: "not_retryable" };
  if (input.attempt >= input.maxAttempts) return { action: "give_up", reason: "attempt_cap" };

  const exponentialDelay = input.baseDelayMs * 2 ** (input.attempt - 1);
  const jitterMultiplier = 1 + (input.random() - 0.5) * 2 * input.jitterRatio;
  const jitteredDelay = Math.round(exponentialDelay * jitterMultiplier);
  const delayMs = input.retryAfterMs ?? Math.min(input.maxDelayMs, jitteredDelay);

  return { action: "retry", delayMs, reason };
};

const computeDelayMs = (input: Omit<RetryInput, "status">): number => {
  const exponentialDelay = input.baseDelayMs * 2 ** (input.attempt - 1);
  const jitterMultiplier = 1 + (input.random() - 0.5) * 2 * input.jitterRatio;
  const jitteredDelay = Math.round(exponentialDelay * jitterMultiplier);
  return input.retryAfterMs ?? Math.min(input.maxDelayMs, jitteredDelay);
};

export const planStreamRetry = (input: RetryStreamInput): RetryStreamPlan => {
  assertRetryWindow(input.attempt, input.maxAttempts);
  if (input.attempt >= input.maxAttempts) return { action: "give_up", reason: "attempt_cap" };
  return { action: "retry", delayMs: computeDelayMs(input), reason: "stream_interruption" };
};

export const planJsonRepair = (input: JsonRepairInput): JsonRepairPlan => {
  assertPositiveInteger(input.attempts, "attempts");
  assertPositiveInteger(input.maxAttempts, "maxAttempts");
  if (input.attempts >= input.maxAttempts) return { action: "give_up", reason: "attempt_cap" };
  return { action: "retry", reason: "json_repair" };
};

export const planToolCallLoop = (input: ToolCallLoopInput): ToolCallLoopPlan => {
  assertRetryWindow(input.attempt, input.maxAttempts);
  if (input.attempt >= input.maxAttempts) {
    return { action: "handoff", reason: "tool_call_loop" };
  }

  return { action: "retry", reason: "tool_call_loop" };
};
