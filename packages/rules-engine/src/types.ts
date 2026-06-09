export type RuleScope = "directory" | "file-pattern" | "global" | "project";

export interface RuleRecord {
  readonly content: string;
  readonly normalizedHash: string;
  readonly priority: number;
  readonly scope: RuleScope;
  readonly sourcePath: string;
}

export interface RuleDiagnostic {
  readonly code: "rule_budget_exceeded";
  readonly sourcePath: string;
}

export interface RulesInjectionResult {
  readonly diagnostics: readonly RuleDiagnostic[];
  readonly ok: boolean;
  readonly output: string;
  readonly rules: readonly RuleRecord[];
}
