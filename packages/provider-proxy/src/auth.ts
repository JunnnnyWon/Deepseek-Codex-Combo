import { redactText } from "../../shared/src/redact.ts";

export const buildUpstreamHeaders = (requestHeaders: Headers): Headers => {
  const upstreamHeaders = new Headers({ "content-type": "application/json" });
  const authorization = requestHeaders.get("authorization");

  if (authorization !== null && authorization.length > 0) {
    upstreamHeaders.set("authorization", authorization);
  }

  return upstreamHeaders;
};

export const redactProxyLogValue = (
  value: string,
  sensitiveTerms: readonly string[] = [],
): string => redactText(value, { sensitiveTerms });
