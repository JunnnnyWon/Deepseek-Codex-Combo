export type { DoctorFixture, DoctorOptions, DoctorResult } from "./doctor.ts";
export { renderDoctorResult, runDoctor } from "./doctor.ts";
export type {
  HookFixture,
  HookResult,
  PostToolUseInput,
  UserPromptSubmitInput,
} from "./hooks/lifecycle.ts";
export {
  loadHookFixture,
  renderHookResult,
  runNoopHook,
  runPostToolUseHook,
  runSessionStartHook,
  runStopHook,
  runSubagentStopHook,
  runUserPromptSubmitHook,
} from "./hooks/lifecycle.ts";
export type { InitDeepOptions, InitDeepResult } from "./initDeep.ts";
export { runInitDeep } from "./initDeep.ts";
export type { LoopCommandOptions } from "./loop.ts";
export { runLoopCommand } from "./loop.ts";
export type { OrchestrationResult, StartWorkCommandOptions } from "./orchestration.ts";
export { runStartWorkCommand } from "./orchestration.ts";
export type { PlanCommandOptions, PlanCommandResult } from "./plan.ts";
export { runPlanCommand } from "./plan.ts";
export type {
  ChecksumManifest,
  ReleaseFileEntry,
  ReleaseManifest,
  ReleasePackageOptions,
  ReleasePackageResult,
} from "./releasePackage.ts";
export { createReleasePackage, renderReleasePackageResult } from "./releasePackage.ts";
export type { SwitchOptions, SwitchPlan, SwitchTarget } from "./switch.ts";
export { createSwitchPlan, renderSwitchPlanForCli } from "./switch.ts";

export const packageName = "@deepseek-codex-combo/cli";
