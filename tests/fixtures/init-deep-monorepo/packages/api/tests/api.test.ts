import { describe, expect, it } from "vitest";
import { greet } from "../src/index";

describe("greet", () => {
  it("returns a greeting", () => {
    expect(greet("world")).toBe("hello world");
  });
});
