import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export interface PlanCommandOptions {
  readonly cwd: string;
  readonly task: string;
}

export interface PlanCommandResult {
  readonly exitCode: 0 | 1;
  readonly lines: readonly string[];
}

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const inactivePlansKey = "inactivePlans";
const sessionsKey = "sessions";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80) || "dcc-plan";

const planPathForTask = (cwd: string, task: string): string =>
  join(cwd, "plans", `${slugify(task)}.md`);

const planMarkdown = (title: string): string =>
  [
    `# Plan: ${title}`,
    "",
    "## Goal",
    "",
    title,
    "",
    "## Assumptions",
    "- Repo is ready for focused orchestration work.",
    "",
    "## Non-goals",
    "- Product code changes are not made by the planner.",
    "",
    "## Files likely to change",
    "- plans/<slug>.md",
    "",
    "## Execution checklist",
    "- [ ] 1. Gather context",
    "- [ ] 2. Execute work",
    "",
    "## Acceptance criteria",
    "- [ ] Plan is specific enough to start work.",
    "",
    "## QA Scenarios",
    "- [ ] Plan-only path leaves product code untouched.",
    "",
    "## Verification matrix",
    "| Check | Command/manual action | Evidence path |",
    "|---|---|---|",
    "| Plan file created | `node bin/dcc.mjs plan ...` | .dcc/evidence/<session-id>/task-17-plan-only.txt |",
    "",
    "## Rollback plan",
    "- Remove the generated plan and inactive metadata entry.",
    "",
    "## Risks",
    "- Overly broad task text can create an imprecise plan.",
    "",
  ].join("\n");

const readMetadata = async (filePath: string): Promise<Record<string, unknown>> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return {};
    }
    throw error;
  }
};

const updateBoulderPlanMetadata = async (
  cwd: string,
  planPath: string,
  title: string,
): Promise<void> => {
  const filePath = join(cwd, ".dcc", "boulder.json");
  const current = await readMetadata(filePath);
  const rawInactivePlans = current[inactivePlansKey];
  const inactivePlans = isRecord(rawInactivePlans) ? rawInactivePlans : {};
  const next = {
    ...current,
    inactivePlans: {
      ...inactivePlans,
      [planPath]: { active: false, createdAt: new Date().toISOString(), planPath, title },
    },
    sessions: isRecord(current[sessionsKey]) ? current[sessionsKey] : {},
    version: 1,
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
};

export const runPlanCommand = async (options: PlanCommandOptions): Promise<PlanCommandResult> => {
  const path = planPathForTask(options.cwd, options.task);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${planMarkdown(options.task)}\n`, "utf8");
  await updateBoulderPlanMetadata(options.cwd, relative(options.cwd, path), options.task);
  return {
    exitCode: 0,
    lines: [`plan created: ${relative(options.cwd, path)}`, "inactive metadata registered"],
  };
};
