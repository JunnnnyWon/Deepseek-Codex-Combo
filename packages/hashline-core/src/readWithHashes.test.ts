import { describe, expect, it } from "vitest";
import { formatHashlineRead, readWithHashes } from "./hashline";

describe("hashline read", () => {
  it("emits_stable_line_hashes", () => {
    const result = readWithHashes("alpha\nbeta");

    expect(result.entries).toEqual([
      { hash: "8ed3f6ad", lineNumber: 1, text: "alpha" },
      { hash: "f44e64e7", lineNumber: 2, text: "beta" },
    ]);
    expect(formatHashlineRead("alpha\nbeta")).toBe("L1#8ed3f6ad alpha\nL2#f44e64e7 beta");
  });
});
