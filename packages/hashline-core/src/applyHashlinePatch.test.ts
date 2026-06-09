import { describe, expect, it } from "vitest";
import { applyHashlinePatch, verifyHashlinePatch } from "./hashline";

describe("hashline apply", () => {
  it("rejects_stale_hash", () => {
    const result = applyHashlinePatch("alpha\nbeta", "@@ L1#00000000\n- alpha\n+ omega\n");

    expect(result).toEqual({
      applied: false,
      refreshSuggested: true,
      reason: "hash_mismatch",
    });
  });

  it("applies_matching_hash_patch", () => {
    const result = applyHashlinePatch("alpha\nbeta", "@@ L2#f44e64e7\n- beta\n+ gamma\n");

    expect(result).toEqual({
      applied: true,
      content: "alpha\ngamma",
      refreshSuggested: false,
    });
    expect(verifyHashlinePatch("beta", "f44e64e7")).toBe(true);
  });
});
