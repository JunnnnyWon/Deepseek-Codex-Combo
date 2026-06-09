import { readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { startBoulderSession } from "../../boulder-state/src/index.ts";

export interface StartWorkCommandOptions {
  readonly completeTaskIndex?: number;
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly evidencePath?: string;
  readonly planPath: string;
  readonly sessionId?: string;
}

export interface OrchestrationResult {
  readonly exitCode: 0 | 1;
  readonly lines: readonly string[];
}

const readJson = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sessionsKey = "sessions";
const statusKey = "status";

const planHasQAScenarios = async (planPath: string): Promise<boolean> => {
  const text = await readFile(planPath, "utf8");
  return /QA Scenarios/i.test(text) || /Scenario:/i.test(text);
};

const markChecklistComplete = async (planPath: string, taskIndex: number): Promise<boolean> => {
  const content = await readFile(planPath, "utf8");
  const taskMarker = `- [ ] ${taskIndex}.`;
  if (!content.includes(taskMarker)) {
    return false;
  }
  const next = content.replace(taskMarker, `- [x] ${taskIndex}.`);
  await writeFile(planPath, next, "utf8");
  return true;
};

const hasEvidence = async (path: string): Promise<boolean> => {
  try {
    const evidence = await readFile(path, "utf8");
    return evidence.trim().length > 0;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
};

const evidenceRecordIsPass = (value: unknown): boolean =>
  isRecord(value) && value[statusKey] === "pass";

const hasVerificationEvidence = async (path: string): Promise<boolean> => {
  try {
    const evidence = await readFile(path, "utf8");
    for (const line of evidence.split(/\r?\n/)) {
      const entry = line.trim();
      if (entry.length === 0) {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(entry);
        if (evidenceRecordIsPass(parsed)) {
          return true;
        }
      } catch (error: unknown) {
        if (error instanceof SyntaxError) {
          continue;
        }
        throw error;
      }
    }
    return false;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
};

const writeCompletedTaskState = async (
  cwd: string,
  sessionId: string,
  planPath: string,
  taskIndex: number,
  evidencePath: string,
): Promise<void> => {
  const statePath = join(cwd, ".dcc", "boulder.json");
  const parsed = (await readJson<Record<string, unknown>>(statePath)) ?? {};
  const sessions = isRecord(parsed[sessionsKey]) ? parsed[sessionsKey] : {};
  const now = new Date().toISOString();
  const session = {
    acceptance: [],
    createdAt: now,
    modelProfile: "deepseek-pro",
    planPath,
    status: "complete",
    tasks: [
      {
        evidence: [evidencePath],
        id: String(taskIndex),
        status: "done",
        title: `Task ${taskIndex}`,
      },
    ],
    updatedAt: now,
  };
  await writeFile(
    statePath,
    `${JSON.stringify({ ...parsed, activeSessionId: sessionId, sessions: { ...sessions, [sessionId]: session }, version: 1 }, null, 2)}\n`,
    "utf8",
  );
};

export const runStartWorkCommand = async (
  options: StartWorkCommandOptions,
): Promise<OrchestrationResult> => {
  if (options.planPath === "verify") {
    const sessionId = options.sessionId;
    if (sessionId === undefined || sessionId.length === 0) {
      return { exitCode: 1, lines: ["verification_evidence_required"] };
    }
    const evidencePath = join(options.cwd, ".dcc", "ulw-loop", sessionId, "evidence.jsonl");
    if (!(await hasVerificationEvidence(evidencePath))) {
      return { exitCode: 1, lines: ["verification_evidence_required"] };
    }
    return { exitCode: 0, lines: ["DCC_VERIFICATION_COMPLETE"] };
  }

  const resolvedPlan = resolve(options.cwd, options.planPath);
  let exists = true;
  try {
    await stat(resolvedPlan);
  } catch (error) {
    if (isMissingFile(error)) {
      exists = false;
    } else {
      throw error;
    }
  }
  if (!exists) {
    return { exitCode: 1, lines: ["plan_not_found"] };
  }

  if (!(await planHasQAScenarios(resolvedPlan))) {
    return { exitCode: 1, lines: ["missing_qa_scenario"] };
  }

  if (options.completeTaskIndex !== undefined || options.evidencePath !== undefined) {
    if (options.completeTaskIndex === undefined || options.evidencePath === undefined) {
      return { exitCode: 1, lines: ["missing_evidence_for_task"] };
    }

    const evidencePath = resolve(options.cwd, options.evidencePath);
    if (!(await hasEvidence(evidencePath))) {
      return { exitCode: 1, lines: ["missing_evidence_for_task"] };
    }

    if (!Number.isInteger(options.completeTaskIndex) || options.completeTaskIndex <= 0) {
      return { exitCode: 1, lines: ["invalid_complete_task"] };
    }
  }

  if (options.dryRun) {
    return { exitCode: 0, lines: [`start-work dry-run: ${relative(options.cwd, resolvedPlan)}`] };
  }

  const started = await startBoulderSession({
    cwd: options.cwd,
    planPath: relative(options.cwd, resolvedPlan),
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
  });
  if (options.completeTaskIndex !== undefined && options.evidencePath !== undefined) {
    if (!(await markChecklistComplete(resolvedPlan, options.completeTaskIndex))) {
      return { exitCode: 1, lines: ["checklist_task_not_found"] };
    }
    await writeCompletedTaskState(
      options.cwd,
      started.session.id,
      relative(options.cwd, resolvedPlan),
      options.completeTaskIndex,
      options.evidencePath,
    );
  }

  const lines = [
    `start-work active: ${started.session.id}`,
    `evidence dir: ${started.evidenceDir}`,
  ];
  if (options.completeTaskIndex !== undefined && options.evidencePath !== undefined) {
    lines.push("DCC_ORCHESTRATION_COMPLETE");
  }
  return { exitCode: 0, lines };
};
