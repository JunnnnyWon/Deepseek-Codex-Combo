import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface LoopCommandOptions {
  readonly cwd: string;
  readonly maxSteps: number;
  readonly resumeSessionId?: string;
  readonly sessionId?: string;
  readonly task?: string;
}

export interface LoopCommandResult {
  readonly exitCode: 0 | 1;
  readonly lines: readonly string[];
}

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const readOptionalText = async (filePath: string): Promise<string> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return "";
    }
    throw error;
  }
};

const loopDir = (cwd: string, sessionId: string): string =>
  join(cwd, ".dcc", "ulw-loop", sessionId);

const loopGoals = (sessionId: string, task: string): Record<string, unknown> => ({
  createdAt: new Date().toISOString(),
  sessionId,
  status: "active",
  task,
  updatedAt: new Date().toISOString(),
  version: 1,
});

const writeIfEmpty = async (filePath: string, text: string): Promise<void> => {
  const existing = await readOptionalText(filePath);
  if (existing.trim().length === 0) {
    await writeFile(filePath, text, "utf8");
  }
};

const ensureEvidence = async (evidencePath: string, isResume: boolean): Promise<void> => {
  const existing = await readOptionalText(evidencePath);
  let nextEvidence = existing;

  if (!nextEvidence.includes('"event":"started"')) {
    nextEvidence = `${nextEvidence}{"event":"started"}\n`;
  }

  if (isResume) {
    nextEvidence = `${nextEvidence}{"event":"resume"}\n`;
  }

  if (nextEvidence !== existing) {
    await writeFile(evidencePath, nextEvidence, "utf8");
  }
};

export const runLoopCommand = async (options: LoopCommandOptions): Promise<LoopCommandResult> => {
  const sessionId = options.resumeSessionId ?? options.sessionId ?? `dcc_${Date.now()}`;
  const root = loopDir(options.cwd, sessionId);
  await mkdir(root, { recursive: true });

  const goalsPath = join(root, "goals.json");
  const evidencePath = join(root, "evidence.jsonl");
  const notepadPath = join(root, "notepad.md");
  const task = options.task ?? "resume";

  await writeIfEmpty(goalsPath, `${JSON.stringify(loopGoals(sessionId, task), null, 2)}\n`);
  await ensureEvidence(evidencePath, options.resumeSessionId !== undefined);
  await writeIfEmpty(notepadPath, `# Durable Loop\n\nSession: ${sessionId}\nTask: ${task}\n`);

  const lines = [
    `loop session: ${sessionId}`,
    `goals: ${relative(options.cwd, goalsPath)}`,
    `evidence: ${relative(options.cwd, evidencePath)}`,
    `notepad: ${relative(options.cwd, notepadPath)}`,
  ];
  if (options.maxSteps === 0) {
    lines.push("max steps: 0");
  }
  if (options.resumeSessionId !== undefined) {
    lines.push("resumed");
  }
  return { exitCode: 0, lines };
};
