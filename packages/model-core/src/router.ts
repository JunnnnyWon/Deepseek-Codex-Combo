export type DeepSeekModelId = "deepseek-v4-flash" | "deepseek-v4-pro";
export type DccAgentSlug =
  | "dcc-librarian-flash"
  | "dcc-planner-pro"
  | "dcc-verifier-pro"
  | "dcc-worker-flash"
  | "dcc-worker-pro";
export type ReasoningPolicy = "disabled" | "enabled";
export type RouteEffort = "high" | "max" | "none";
export type TaskCategory =
  | "deep-refactor"
  | "librarian"
  | "plan"
  | "quick"
  | "security"
  | "standard-code"
  | "summarize"
  | "ultrawork"
  | "verify";

export interface CatalogModel {
  readonly displayName: string;
  readonly id: DeepSeekModelId;
  readonly reasoning: boolean;
}

export interface RouteRequest {
  readonly category: TaskCategory;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RouteDecision {
  readonly agentSlug: DccAgentSlug;
  readonly effort: RouteEffort;
  readonly fallback: DeepSeekModelId;
  readonly model: DeepSeekModelId;
  readonly reasoning: ReasoningPolicy;
}

export interface PromptRouteDecision extends RouteDecision {
  readonly category: TaskCategory;
}

const proModel: DeepSeekModelId = "deepseek-v4-pro";
const flashModel: DeepSeekModelId = "deepseek-v4-flash";

const catalogModels: readonly CatalogModel[] = [
  { displayName: "DeepSeek V4 Flash", id: flashModel, reasoning: false },
  { displayName: "DeepSeek V4 Pro", id: proModel, reasoning: true },
];

const isModelId = (candidate: string | undefined): candidate is DeepSeekModelId =>
  candidate === proModel || candidate === flashModel;

const resolveModel = (
  preferred: DeepSeekModelId,
  env: NodeJS.ProcessEnv | undefined,
): DeepSeekModelId => {
  const { DCC_FLASH_MODEL, DCC_PRO_MODEL } = env ?? {};
  const override = preferred === proModel ? DCC_PRO_MODEL : DCC_FLASH_MODEL;
  return isModelId(override) ? override : preferred;
};

const routeTable: Record<TaskCategory, RouteDecision> = {
  "deep-refactor": {
    agentSlug: "dcc-worker-pro",
    effort: "max",
    fallback: flashModel,
    model: proModel,
    reasoning: "enabled",
  },
  librarian: {
    agentSlug: "dcc-librarian-flash",
    effort: "none",
    fallback: proModel,
    model: flashModel,
    reasoning: "disabled",
  },
  plan: {
    agentSlug: "dcc-planner-pro",
    effort: "high",
    fallback: flashModel,
    model: proModel,
    reasoning: "enabled",
  },
  quick: {
    agentSlug: "dcc-worker-flash",
    effort: "none",
    fallback: proModel,
    model: flashModel,
    reasoning: "disabled",
  },
  security: {
    agentSlug: "dcc-verifier-pro",
    effort: "max",
    fallback: flashModel,
    model: proModel,
    reasoning: "enabled",
  },
  "standard-code": {
    agentSlug: "dcc-worker-flash",
    effort: "high",
    fallback: proModel,
    model: flashModel,
    reasoning: "disabled",
  },
  summarize: {
    agentSlug: "dcc-librarian-flash",
    effort: "none",
    fallback: proModel,
    model: flashModel,
    reasoning: "disabled",
  },
  ultrawork: {
    agentSlug: "dcc-worker-pro",
    effort: "max",
    fallback: flashModel,
    model: proModel,
    reasoning: "enabled",
  },
  verify: {
    agentSlug: "dcc-verifier-pro",
    effort: "high",
    fallback: flashModel,
    model: proModel,
    reasoning: "enabled",
  },
};

const keywordGroups: readonly {
  readonly category: TaskCategory;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    category: "ultrawork",
    patterns: [/ultrawork|ulw/i, /완벽|끝까지/i],
  },
  {
    category: "security",
    patterns: [
      /auth|permission|secret|security|vulnerab|exploit|cve/i,
      /보안|취약|권한|인증|시크릿|비밀키/i,
    ],
  },
  {
    category: "verify",
    patterns: [
      /verify|review|regression|test all|qa|e2e|end[- ]to[- ]end/i,
      /검증|리뷰|테스트|회귀|실제 유저|이투이/i,
    ],
  },
  {
    category: "plan",
    patterns: [/plan|design|architecture|spec/i, /계획|설계|명세|아키텍처/i],
  },
  {
    category: "deep-refactor",
    patterns: [
      /refactor|migration|restructure|multi[- ]module|large/i,
      /리팩터|마이그레이션|구조 변경|대규모/i,
    ],
  },
  {
    category: "summarize",
    patterns: [/summari[sz]e|explain|describe/i, /요약|설명|정리/i],
  },
  {
    category: "librarian",
    patterns: [/search|lookup|find|docs|documentation|grep|rg/i, /검색|찾아|문서|자료/i],
  },
  {
    category: "quick",
    patterns: [/quick|simple|small|typo|format/i, /간단|빠르게|오타|포맷/i],
  },
];

export const classifyPrompt = (prompt: string): TaskCategory => {
  const normalized = prompt.trim();
  if (normalized.length === 0) {
    return "plan";
  }

  for (const group of keywordGroups) {
    if (group.patterns.some((pattern) => pattern.test(normalized))) {
      return group.category;
    }
  }

  return "standard-code";
};

export const listCatalogModels = (): readonly CatalogModel[] => catalogModels;

export const routeTask = (request: RouteRequest): RouteDecision => {
  const route = routeTable[request.category];
  const model = resolveModel(route.model, request.env);
  return {
    ...route,
    model,
    fallback: model === proModel ? flashModel : proModel,
  };
};

export const routePrompt = (request: {
  readonly env?: NodeJS.ProcessEnv;
  readonly prompt: string;
}): PromptRouteDecision => {
  const category = classifyPrompt(request.prompt);
  return {
    ...routeTask({ category, ...(request.env === undefined ? {} : { env: request.env }) }),
    category,
  };
};
