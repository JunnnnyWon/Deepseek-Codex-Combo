import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const coreCommands = [
  "auth",
  "install",
  "uninstall",
  "doctor",
  "proxy",
  "init-deep",
  "plan",
  "start-work",
  "loop",
  "switch",
  "sandbox",
  "models",
  "rules",
  "evidence",
] as const;

const helpCommands = [
  ["install", "--help"],
  ["uninstall", "--help"],
  ["doctor", "--help"],
  ["proxy", "--help"],
  ["proxy", "start", "--help", "--port", "41473"],
  ["package", "--help"],
  ["hooks", "--help"],
  ["lsp", "--help"],
  ["ast-grep", "--help"],
  ["hashline", "--help"],
  ["start-work", "--help"],
  ["loop", "--help"],
  ["init-deep", "--help"],
  ["sandbox", "--help"],
  ["auth", "--help"],
] as const;

const makeTempDir = (): string => mkdtempSync(join(tmpdir(), "dcc-help-test-"));

const cleanupTempDir = (path: string): void => {
  rmSync(path, { force: true, recursive: true });
};

const runDcc = (args: readonly string[], home: string, cwd = process.cwd()) =>
  spawnSync(process.execPath, [join(process.cwd(), "bin", "dcc.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: home },
    timeout: 2_000,
  });

describe("dcc help", () => {
  it("lists core commands", () => {
    const result = spawnSync(process.execPath, ["bin/dcc.mjs", "--help"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });

    expect(result.status).toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    for (const command of coreCommands) {
      expect(output).toContain(command);
    }
  });

  it("fails cleanly for an unknown command", () => {
    const result = spawnSync(process.execPath, ["bin/dcc.mjs", "does-not-exist"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });

    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output.toLowerCase()).toContain("unknown command");
  });

  for (const commandArgs of helpCommands) {
    it(`prints side-effect-free help for ${commandArgs.join(" ")}`, () => {
      const home = makeTempDir();
      const outDir = makeTempDir();
      const cwd = makeTempDir();
      try {
        const args =
          commandArgs[0] === "package" ? [...commandArgs, "--out", outDir] : [...commandArgs];
        const result = runDcc(args, home, cwd);
        const output = `${result.stdout}\n${result.stderr}`;

        expect(result.status).toBe(0);
        expect(output).toContain("Usage:");
        expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
        expect(existsSync(join(outDir, "manifest.json"))).toBe(false);
        expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
        expect(existsSync(join(cwd, ".dcc", "project-index.json"))).toBe(false);
      } finally {
        cleanupTempDir(home);
        cleanupTempDir(outDir);
        cleanupTempDir(cwd);
      }
    });
  }

  it("does not create install files when install help is requested", () => {
    const home = makeTempDir();
    try {
      const result = runDcc(["install", "--help", "--home", home], home);
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("Usage:");
      expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
    } finally {
      cleanupTempDir(home);
    }
  });

  it("does not modify an existing config when uninstall help is requested", () => {
    const home = makeTempDir();
    const configPath = join(home, ".codex", "config.toml");
    const existingConfig = '# user config\nmodel = "codex-default"\n';
    try {
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(configPath, existingConfig);

      const result = runDcc(["uninstall", "--help", "--home", home], home);
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("Usage:");
      expect(readFileSync(configPath, "utf8")).toBe(existingConfig);
    } finally {
      cleanupTempDir(home);
    }
  });
});
