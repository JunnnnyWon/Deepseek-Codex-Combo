import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withPluginDistLock } from "../../harness/pluginDistLock.ts";

const hookEvents = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "PostCompact",
  "Stop",
  "SubagentStop",
] as const;
const pluginRootPlaceholder = "$" + "{PLUGIN_ROOT}";

const hookEventSchema = z.enum(hookEvents);

const hookCommandSchema = z.object({
  command: z.string().min(1),
  statusMessage: z.string().min(1),
  type: z.literal("command"),
});

const hooksManifestSchema = z.object({
  hooks: z.record(
    hookEventSchema,
    z.array(z.object({ hooks: z.array(hookCommandSchema).min(1) })).min(1),
  ),
});

type HookEvent = (typeof hookEvents)[number];
type HookCommand = z.infer<typeof hookCommandSchema>;

class MissingHookCommandError extends Error {
  readonly name = "MissingHookCommandError";

  constructor(event: HookEvent) {
    super(`missing hook command for ${event}`);
  }
}

type HookRun = {
  readonly event: HookEvent;
  readonly excludes?: readonly string[];
  readonly expectedStatus: number;
  readonly fixture?: string;
  readonly includes: readonly string[];
};

const hookRuns: readonly HookRun[] = [
  {
    event: "SessionStart",
    expectedStatus: 0,
    includes: ["DCC: ready", "model=deepseek-v4-flash"],
  },
  {
    event: "UserPromptSubmit",
    expectedStatus: 0,
    excludes: ["sk-secret-123", "do not echo this raw prompt"],
    fixture: "tests/fixtures/hooks/prompt-with-secret.json",
    includes: [
      "workflow directive: ultrawork",
      "model route: category=ultrawork model=deepseek-v4-pro",
      "agent route: use=dcc-worker-pro",
      "prompt: redacted",
    ],
  },
  {
    event: "PostToolUse",
    expectedStatus: 2,
    fixture: "tests/fixtures/hooks/slop-comment.json",
    includes: ["Checking Comments", "ai_slop_comment", "comment-checker: blocked"],
  },
  {
    event: "PostToolUse",
    expectedStatus: 2,
    fixture: "tests/fixtures/hooks/ts-error-post-tool-use.json",
    includes: ["LSP diagnostics", "lsp: blocked"],
  },
  {
    event: "PostCompact",
    expectedStatus: 0,
    includes: ["post-compact: continuation check deferred"],
  },
  {
    event: "Stop",
    expectedStatus: 2,
    fixture: "tests/fixtures/boulder/incomplete-plan.json",
    includes: ['"decision":"block"', "missing_evidence", "A1"],
  },
  {
    event: "Stop",
    expectedStatus: 0,
    fixture: "tests/fixtures/boulder/complete-plan.json",
    includes: ['"decision":"approve"', "evidence_complete"],
  },
  {
    event: "SubagentStop",
    expectedStatus: 2,
    fixture: "tests/fixtures/boulder/incomplete-subagent-plan.json",
    includes: ['"decision":"block"', "missing_evidence", "SA1"],
  },
  {
    event: "SubagentStop",
    expectedStatus: 0,
    fixture: "tests/fixtures/boulder/complete-subagent-plan.json",
    includes: ['"decision":"approve"', "evidence_complete"],
  },
];

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const readInstalledManifest = (pluginRoot: string): z.infer<typeof hooksManifestSchema> =>
  hooksManifestSchema.parse(
    JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8")),
  );

const hookCommandFor = (
  manifest: z.infer<typeof hooksManifestSchema>,
  event: HookEvent,
): HookCommand => {
  const command = manifest.hooks[event][0]?.hooks[0];
  if (command === undefined) {
    throw new MissingHookCommandError(event);
  }
  return command;
};

const resolveHookCommandArgs = (
  command: HookCommand,
  pluginRoot: string,
): readonly [string, ...string[]] => {
  const resolved = command.command.replaceAll(pluginRootPlaceholder, pluginRoot).split(" ");
  const executable = resolved[0];
  if (executable === undefined || executable.length === 0) {
    throw new MissingHookCommandError("SessionStart");
  }
  return [executable, ...resolved.slice(1)];
};

const installPluginIntoTempHome = (): { readonly home: string; readonly pluginRoot: string } => {
  const home = mkdtempSync(join(tmpdir(), "dcc-hooks-home-"));
  const pluginRoot = join(home, ".codex", "plugins", "deepseek-codex-combo");
  mkdirSync(dirname(pluginRoot), { recursive: true });
  withPluginDistLock(() =>
    cpSync(join(process.cwd(), "plugins", "deepseek-codex-combo"), pluginRoot, {
      recursive: true,
    }),
  );
  return { home, pluginRoot };
};

describe("installed plugin hook runtime", () => {
  it("manifest_hook_commands_run_from_copied_plugin_runtime", () => {
    const build = spawnSync(pnpmBin, ["--filter", "@deepseek-codex-combo/codex-plugin", "build"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(`${build.stdout}\n${build.stderr}`).not.toContain("error");
    expect(build.status).toBe(0);

    const install = installPluginIntoTempHome();
    try {
      const manifest = readInstalledManifest(install.pluginRoot);
      for (const run of hookRuns) {
        const command = hookCommandFor(manifest, run.event);
        expect(command.statusMessage).toContain("DCC:");
        const [executable, ...commandArgs] = resolveHookCommandArgs(command, install.pluginRoot);

        const result = spawnSync(executable, commandArgs, {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: install.home,
            PLUGIN_ROOT: install.pluginRoot,
          },
          input:
            run.fixture === undefined ? undefined : readFileSync(join(process.cwd(), run.fixture)),
          timeout: 5_000,
        });
        const output = `${result.stdout}\n${result.stderr}`;

        expect(result.status, `${run.event}\n${output}`).toBe(run.expectedStatus);
        for (const expected of run.includes) {
          expect(output).toContain(expected);
        }
        for (const forbidden of run.excludes ?? []) {
          expect(output).not.toContain(forbidden);
        }
      }
    } finally {
      rmSync(install.home, { force: true, recursive: true });
    }
  }, 20_000);
});
