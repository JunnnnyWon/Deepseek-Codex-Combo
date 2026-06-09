import { readFile } from "node:fs/promises";
import {
  type BoulderState,
  evaluateContinuation,
  parseBoulderState,
} from "../../../boulder-state/src/index.ts";
import { checkCommentText } from "../../../comment-checker-core/src/checker.ts";
import { runLspDiagnosticsFromText } from "../../../lsp-tools-mcp/src/diagnostics.ts";
import { routePrompt } from "../../../model-core/src/router.ts";

export interface HookResult {
  readonly exitCode: 0 | 2;
  readonly lines: readonly string[];
}

export interface UserPromptSubmitInput {
  readonly prompt: string;
}

export interface PostToolUseInput {
  readonly content: string;
  readonly filePath?: string;
  readonly toolName: string;
}

export type HookFixture =
  | ({ readonly hook_event_name: "PostToolUse" } & PostToolUseInput)
  | { readonly hook_event_name: "Stop"; readonly boulder: BoulderState }
  | { readonly hook_event_name: "SubagentStop"; readonly boulder: BoulderState }
  | ({ readonly hook_event_name: "UserPromptSubmit" } & UserPromptSubmitInput);

interface RawHookFixture {
  readonly boulder?: unknown;
  readonly content?: unknown;
  readonly file_path?: unknown;
  readonly hook_event_name?: unknown;
  readonly prompt?: unknown;
  readonly tool_name?: unknown;
}

const isRawHookFixture = (value: unknown): value is RawHookFixture =>
  typeof value === "object" && value !== null;

export const parseHookFixture = (parsed: unknown): HookFixture => {
  if (!isRawHookFixture(parsed)) {
    throw new Error("hook_fixture_invalid");
  }

  if (
    parsed.hook_event_name === "PostToolUse" &&
    typeof parsed.tool_name === "string" &&
    typeof parsed.content === "string"
  ) {
    return {
      content: parsed.content,
      ...(typeof parsed.file_path === "string" ? { filePath: parsed.file_path } : {}),
      hook_event_name: "PostToolUse",
      toolName: parsed.tool_name,
    };
  }

  if (parsed.hook_event_name === "UserPromptSubmit" && typeof parsed.prompt === "string") {
    return {
      hook_event_name: "UserPromptSubmit",
      prompt: parsed.prompt,
    };
  }

  if (parsed.hook_event_name === "Stop" || parsed.hook_event_name === "SubagentStop") {
    return {
      boulder: parseBoulderState(parsed.boulder),
      hook_event_name: parsed.hook_event_name,
    };
  }

  throw new Error("hook_fixture_invalid");
};

export const loadHookFixture = async (fixturePath: string): Promise<HookFixture> =>
  parseHookFixture(JSON.parse(await readFile(fixturePath, "utf8")));

export const renderHookResult = (result: HookResult): string => result.lines.join("\n");

export const runSessionStartHook = (): HookResult => ({
  exitCode: 0,
  lines: [
    "DCC: ready",
    "proxy=check-skipped",
    "model=deepseek-v4-flash",
    "rules=ready",
    "telemetry=off",
    "lsp=lazy",
  ],
});

export const runUserPromptSubmitHook = (input: UserPromptSubmitInput): HookResult => {
  const lowerPrompt = input.prompt.toLowerCase();
  const directive =
    lowerPrompt.includes("ultrawork") || lowerPrompt.includes("ulw")
      ? "ultrawork"
      : lowerPrompt.includes("start-work")
        ? "start-work"
        : "none";
  const route = routePrompt({ prompt: input.prompt });

  return {
    exitCode: 0,
    lines: [
      `workflow directive: ${directive}`,
      `model route: category=${route.category} model=${route.model}`,
      `agent route: use=${route.agentSlug}`,
      `agent instruction: delegate to ${route.agentSlug} and continue until the request is complete`,
      "rules injection: ready",
      "prompt: redacted",
    ],
  };
};

export const runPostToolUseHook = (input: PostToolUseInput): HookResult => {
  const check = checkCommentText(input.content);
  const findingLines = check.findings.map(
    (finding) => `${finding.code}: line ${finding.line}: ${finding.message}`,
  );
  const diagnostics = runLspDiagnosticsFromText(
    input.content,
    input.filePath ?? "post-tool-use.ts",
  );
  const diagnosticLines = diagnostics.diagnostics.map(
    (diagnostic) => `${diagnostic.code}: line ${diagnostic.line}: ${diagnostic.message}`,
  );
  const hasBlockingDiagnostic = diagnostics.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );
  const exitCode = check.exitCode === 2 || hasBlockingDiagnostic ? 2 : 0;

  return {
    exitCode,
    lines: [
      "Checking Comments",
      ...findingLines,
      findingLines.length === 0 ? "comment-checker: ok" : "comment-checker: blocked",
      "LSP diagnostics",
      ...diagnosticLines,
      hasBlockingDiagnostic ? "lsp: blocked" : "lsp: ok",
    ],
  };
};

export const runStopHook = (state: BoulderState): HookResult => evaluateContinuation(state);

export const runSubagentStopHook = (state: BoulderState): HookResult => evaluateContinuation(state);

export const runNoopHook = (name: string): HookResult => ({
  exitCode: 0,
  lines: [`${name}: continuation check deferred`],
});
