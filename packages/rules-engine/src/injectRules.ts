import { dedupeRules } from "./dedupe.ts";
import { discoverRules } from "./discoverRules.ts";
import type { RuleDiagnostic, RuleRecord, RulesInjectionResult } from "./types.ts";

export interface RulesInjectionOptions {
  readonly budget: number;
  readonly cwd: string;
}

const formatRuleBlock = (rule: RuleRecord): string =>
  [
    "<DCC_PROJECT_RULES>",
    `Source: ${rule.sourcePath}`,
    `Scope: ${rule.scope}`,
    "Content:",
    rule.content,
    "</DCC_PROJECT_RULES>",
  ].join("\n");

const formatDiagnostic = (diagnostic: RuleDiagnostic): string =>
  `${diagnostic.code}: skipped ${diagnostic.sourcePath}`;

export const buildRulesInjection = async (
  options: RulesInjectionOptions,
): Promise<RulesInjectionResult> => {
  const rules = dedupeRules(await discoverRules(options.cwd));
  const diagnostics: RuleDiagnostic[] = [];
  const blocks: string[] = [];
  let used = 0;

  for (const rule of rules) {
    const block = formatRuleBlock(rule);
    if (used + block.length > options.budget) {
      diagnostics.push({ code: "rule_budget_exceeded", sourcePath: rule.sourcePath });
      continue;
    }

    blocks.push(block);
    used += block.length;
  }

  return {
    diagnostics,
    ok: diagnostics.length === 0,
    output: blocks.join("\n\n"),
    rules,
  };
};

export const renderRulesInjectionResult = (result: RulesInjectionResult): string => {
  const diagnostics = result.diagnostics.map(formatDiagnostic);
  return [result.output, ...diagnostics].filter((line) => line.length > 0).join("\n");
};
