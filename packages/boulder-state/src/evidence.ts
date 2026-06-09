import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactText } from "../../shared/src/redact.ts";

export interface CommandEvidenceInput {
  readonly artifactName: string;
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number;
  readonly homePath?: string;
  readonly now?: string;
  readonly output: string;
  readonly sessionId: string;
  readonly summary: string;
}

export interface CommandEvidenceRecord {
  readonly artifact: string;
  readonly command: string;
  readonly exitCode: number;
  readonly summary: string;
  readonly timestamp: string;
  readonly type: "command";
}

const safeArtifactName = (value: string): string => value.replace(/[\\/]/g, "-");

export const evidenceDirForSession = (sessionId: string): string => `.dcc/evidence/${sessionId}`;

export const writeCommandEvidence = async (
  input: CommandEvidenceInput,
): Promise<CommandEvidenceRecord> => {
  const root = evidenceDirForSession(input.sessionId);
  const artifact = `${root}/${safeArtifactName(input.artifactName)}`;
  const absoluteRoot = join(input.cwd, root);
  const redactionOptions = input.homePath === undefined ? {} : { homePath: input.homePath };
  const redactedOutput = redactText(input.output, redactionOptions);
  const record: CommandEvidenceRecord = {
    artifact,
    command: redactText(input.command, redactionOptions),
    exitCode: input.exitCode,
    summary: input.summary,
    timestamp: input.now ?? new Date().toISOString(),
    type: "command",
  };

  await mkdir(absoluteRoot, { recursive: true });
  await writeFile(join(input.cwd, artifact), redactedOutput, "utf8");
  await appendFile(join(absoluteRoot, "commands.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  return record;
};
