import { describe, expect, it } from "vitest";
import { listCatalogModels, routePrompt, routeTask } from "./router";

describe("model router", () => {
  it("quick_task_routes_to_flash", () => {
    const route = routeTask({ category: "quick" });

    expect(route.model).toBe("deepseek-v4-flash");
    expect(route.reasoning).toBe("disabled");
    expect(route.fallback).toBe("deepseek-v4-pro");
    expect(route.agentSlug).toBe("dcc-worker-flash");
  });

  it("security_task_routes_to_pro_max", () => {
    const route = routeTask({ category: "security" });

    expect(route.model).toBe("deepseek-v4-pro");
    expect(route.reasoning).toBe("enabled");
    expect(route.effort).toBe("max");
    expect(route.agentSlug).toBe("dcc-verifier-pro");
  });

  it("auto_prompt_routes_lightweight_summary_to_flash", () => {
    const route = routePrompt({ prompt: "이 코드 구조를 간단히 설명해줘" });

    expect(route.category).toBe("summarize");
    expect(route.model).toBe("deepseek-v4-flash");
    expect(route.reasoning).toBe("disabled");
    expect(route.agentSlug).toBe("dcc-librarian-flash");
  });

  it("auto_prompt_routes_complex_security_work_to_pro", () => {
    const route = routePrompt({
      prompt: "인증 취약점까지 검증하면서 전체 E2E 테스트로 완성해줘",
    });

    expect(route.category).toBe("security");
    expect(route.model).toBe("deepseek-v4-pro");
    expect(route.reasoning).toBe("enabled");
    expect(route.agentSlug).toBe("dcc-verifier-pro");
  });

  it("lists_local_deepseek_catalog_models", () => {
    expect(listCatalogModels().map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
  });
});
