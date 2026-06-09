import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface DeepSeekModelContract {
  readonly id: string;
  readonly ownedBy: "deepseek";
  readonly thinkingModes: readonly ["non-thinking", "thinking"];
  readonly toolCalls: true;
  readonly jsonOutput: true;
}

interface DeepSeekContractSnapshot {
  readonly checkedDate: string;
  readonly sources: readonly string[];
  readonly baseUrl: "https://api.deepseek.com";
  readonly modelsEndpoint: "https://api.deepseek.com/models";
  readonly chatCompletionsEndpoint: "https://api.deepseek.com/chat/completions";
  readonly liveCallsDefault: "disabled";
  readonly models: readonly DeepSeekModelContract[];
  readonly legacyModelNames: {
    readonly deprecatedAfterUtc: "2026-07-24T15:59:00Z";
    readonly aliases: readonly ["deepseek-chat", "deepseek-reasoner"];
  };
  readonly reasoning: {
    readonly field: "reasoning_content";
    readonly passBackRequiredAfterToolCalls: true;
    readonly durableLogsMayIncludeReasoningContent: false;
  };
}

const readSnapshot = (): DeepSeekContractSnapshot =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), "tests/fixtures/contracts/deepseek-api-contract.json"),
      "utf8",
    ),
  ) as DeepSeekContractSnapshot;

describe("DeepSeek contract snapshot", () => {
  it("contains the required V4 model contracts", () => {
    const snapshot = readSnapshot();

    expect(snapshot.checkedDate).toBe("2026-06-07");
    expect(snapshot.baseUrl).toBe("https://api.deepseek.com");
    expect(snapshot.models.map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(snapshot.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "deepseek-v4-flash", toolCalls: true, jsonOutput: true }),
        expect.objectContaining({ id: "deepseek-v4-pro", toolCalls: true, jsonOutput: true }),
      ]),
    );
  });

  it("captures reasoning continuation and live-call gating constraints", () => {
    const snapshot = readSnapshot();

    expect(snapshot.sources).toContain("https://api-docs.deepseek.com/");
    expect(snapshot.sources).toContain("https://api-docs.deepseek.com/guides/thinking_mode");
    expect(snapshot.liveCallsDefault).toBe("disabled");
    expect(snapshot.reasoning).toEqual({
      field: "reasoning_content",
      passBackRequiredAfterToolCalls: true,
      durableLogsMayIncludeReasoningContent: false,
    });
  });
});
