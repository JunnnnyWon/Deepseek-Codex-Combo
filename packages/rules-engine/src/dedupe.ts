import type { RuleRecord } from "./types.ts";

export const dedupeRules = (rules: readonly RuleRecord[]): readonly RuleRecord[] => {
  const seenHashes = new Set<string>();
  const unique: RuleRecord[] = [];

  for (const rule of rules) {
    if (!seenHashes.has(rule.normalizedHash)) {
      seenHashes.add(rule.normalizedHash);
      unique.push(rule);
    }
  }

  return unique;
};
