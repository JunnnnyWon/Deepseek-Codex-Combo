export type DeepSeekErrorInput = {
  readonly code?: string;
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly status: number;
};

export type CodexErrorKind =
  | "adapter_error"
  | "auth_error"
  | "model_not_found"
  | "rate_limit_error"
  | "tool_schema_error"
  | "upstream_error";

export type CodexFacingError = {
  readonly kind: CodexErrorKind;
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;
  readonly status: number;
};

const sanitizeReasoningContent = (message: string): string =>
  message.includes("reasoning_content")
    ? message.replace(/reasoning_content/gu, "reasoning continuation")
    : message;

export const mapDeepSeekError = (error: DeepSeekErrorInput): CodexFacingError => {
  if (error.code === "tool_schema_error") {
    return {
      kind: "tool_schema_error",
      message: `DeepSeek tool schema rejected: ${error.message}`,
      retryable: false,
      status: error.status,
    };
  }

  if (error.status === 400 && error.message.includes("reasoning_content")) {
    return {
      kind: "adapter_error",
      message: `DeepSeek reasoning continuation bug: ${sanitizeReasoningContent(error.message)}`,
      retryable: false,
      status: error.status,
    };
  }

  if (error.status === 401 || error.status === 403) {
    return {
      kind: "auth_error",
      message: `DEEPSEEK_API_KEY check failed: ${error.message}`,
      retryable: false,
      status: error.status,
    };
  }

  if (error.status === 404) {
    return {
      kind: "model_not_found",
      message: `DeepSeek model not found: ${error.message}`,
      retryable: false,
      status: error.status,
    };
  }

  if (error.status === 429) {
    return {
      kind: "rate_limit_error",
      message: `DeepSeek rate limit: ${error.message}`,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
      retryable: true,
      status: error.status,
    };
  }

  return {
    kind: "upstream_error",
    message: `DeepSeek upstream error: ${error.message}`,
    retryable: error.status >= 500,
    status: error.status,
  };
};
