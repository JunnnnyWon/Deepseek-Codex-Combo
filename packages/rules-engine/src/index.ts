export { dedupeRules } from "./dedupe.ts";
export { createRuleHash, discoverRules, normalizeRuleContent } from "./discoverRules.ts";
export type { RulesInjectionOptions } from "./injectRules.ts";
export { buildRulesInjection, renderRulesInjectionResult } from "./injectRules.ts";
export type { RuleDiagnostic, RuleRecord, RuleScope, RulesInjectionResult } from "./types.ts";

export const packageName = "@deepseek-codex-combo/rules-engine";
