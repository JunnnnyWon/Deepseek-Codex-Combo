import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLspPrepareRename } from "./index";

describe("lsp rename", () => {
  it("prepare_rename_blocks_unsafe_position", () => {
    const fixturePath = join(process.cwd(), "tests/fixtures/ts-node-app/src/index.ts");
    const result = runLspPrepareRename(fixturePath, 99, 10);

    expect(result.canRename).toBe(false);
    expect(result.reason).toContain("No symbol at position");
  });
});
