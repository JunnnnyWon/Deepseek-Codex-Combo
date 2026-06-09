export type {
  CatalogModel,
  DccAgentSlug,
  DeepSeekModelId,
  PromptRouteDecision,
  ReasoningPolicy,
  RouteDecision,
  RouteEffort,
  RouteRequest,
  TaskCategory,
} from "./router.ts";
export { classifyPrompt, listCatalogModels, routePrompt, routeTask } from "./router.ts";

export const packageName = "@deepseek-codex-combo/model-core";
