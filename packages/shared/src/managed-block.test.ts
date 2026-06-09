import { describe, expect, it } from "vitest";
import { removeManagedBlock, replaceManagedBlock, validateTomlDocument } from "./managed-block";

describe("replaceManagedBlock", () => {
  it("replaces only named dcc block", () => {
    const original = [
      'outside = "kept"',
      "# >>> DCC managed: deepseek-proxy",
      'old_value = "remove me"',
      "# <<< DCC managed: deepseek-proxy",
      "# >>> DCC managed: other",
      'other_value = "unchanged"',
      "# <<< DCC managed: other",
    ].join("\n");

    const next = replaceManagedBlock(original, {
      name: "deepseek-proxy",
      content: 'new_value = "ok"',
    });

    expect(next).toContain('outside = "kept"');
    expect(next).toContain('new_value = "ok"');
    expect(next).toContain('other_value = "unchanged"');
    expect(next).not.toContain("remove me");
    expect(validateTomlDocument(next).ok).toBe(true);
  });

  it("rejects broken toml after managed block replacement", () => {
    const original = [
      "# >>> DCC managed: deepseek-proxy",
      'old_value = "remove me"',
      "# <<< DCC managed: deepseek-proxy",
    ].join("\n");

    const next = replaceManagedBlock(original, {
      name: "deepseek-proxy",
      content: "broken = [",
    });

    expect(validateTomlDocument(next)).toMatchObject({
      ok: false,
      code: "config_parse_error",
    });
  });
});

describe("removeManagedBlock", () => {
  it("removes_only_named_dcc_block", () => {
    const original = [
      'outside = "kept"',
      "# >>> DCC managed: deepseek-current",
      "[profiles.deepseek-current]",
      'model = "deepseek-v4-flash"',
      "# <<< DCC managed: deepseek-current",
      "# >>> DCC managed: other",
      'other_value = "unchanged"',
      "# <<< DCC managed: other",
    ].join("\n");

    const next = removeManagedBlock(original, "deepseek-current");

    expect(next).toContain('outside = "kept"');
    expect(next).toContain('other_value = "unchanged"');
    expect(next).not.toContain("profiles.deepseek-current");
    expect(validateTomlDocument(next).ok).toBe(true);
  });
});
