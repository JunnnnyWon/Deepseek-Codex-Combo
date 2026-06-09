export interface RedactionOptions {
  readonly homePath?: string;
  readonly sensitiveTerms?: readonly string[];
}

const redacted = "[REDACTED]";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const redactByPattern = (value: string, pattern: RegExp): string =>
  value.replace(pattern, redacted);

export const redactText = (value: string, options: RedactionOptions = {}): string => {
  const sensitiveTerms = options.sensitiveTerms ?? [];
  let output = value;

  for (const term of sensitiveTerms) {
    if (term.length > 0) {
      output = output.replace(new RegExp(escapeRegExp(term), "g"), redacted);
    }
  }

  if (options.homePath !== undefined && options.homePath.length > 0) {
    output = output.replace(
      new RegExp(`${escapeRegExp(options.homePath)}[^\\s"'()]*`, "g"),
      redacted,
    );
  }

  output = redactByPattern(output, /\bsk-[A-Za-z0-9_-]+/g);
  output = redactByPattern(output, /Bearer\s+[A-Za-z0-9._-]+/g);
  output = redactByPattern(output, /git@[^:\s]+:[^\s]+/g);
  output = redactByPattern(output, /https?:\/\/[^@\s]+@[^/\s]+\/[^\s]+/g);
  output = redactByPattern(output, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  output = redactByPattern(output, /\b[A-Za-z0-9-]+\.local\b/g);

  return output;
};
