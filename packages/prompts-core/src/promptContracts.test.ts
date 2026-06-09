import { describe, expect, it } from "vitest";
import { getPromptContract } from "./promptContracts.ts";

const planner = getPromptContract("dcc-plan");
if (planner === undefined) {
  throw new Error("planner contract fixture missing");
}

const startWork = getPromptContract("dcc-start-work");
if (startWork === undefined) {
  throw new Error("start-work contract fixture missing");
}

const loop = getPromptContract("dcc-loop");
if (loop === undefined) {
  throw new Error("loop contract fixture missing");
}

const verifier = getPromptContract("dcc-verifier-pro");
if (verifier === undefined) {
  throw new Error("verifier contract fixture missing");
}

describe("prompt contract", () => {
  it("planner_profile_forbids_product_code_edits", () => {
    expect(planner.slug).toBe("dcc-plan");
    expect(planner.profile).toBe("planner");
    expect(planner.description).toContain("Do not edit product code");
    expect(planner.instructionText).toContain("plans/");
  });

  it("start_work_profile_requires_evidence_before_completion", () => {
    expect(startWork.slug).toBe("dcc-start-work");
    expect(startWork.profile).toBe("executor");
    expect(startWork.description).toContain("evidence");
    expect(startWork.instructionText).toContain("DCC_ORCHESTRATION_COMPLETE");
  });

  it("loop_profile_requires_resumeable_evidence", () => {
    expect(loop.slug).toBe("dcc-loop");
    expect(loop.profile).toBe("skill");
    expect(loop.description).toContain("resumeable");
    expect(loop.instructionText).toContain(".dcc/ulw-loop/");
  });

  it("verifier_requires_evidence_before_complete", () => {
    expect(verifier.slug).toBe("dcc-verifier-pro");
    expect(verifier.profile).toBe("verifier");
    expect(verifier.description).toContain("evidence");
    expect(verifier.description).toContain("tests");
    expect(verifier.description).toContain("complete");
  });
});
