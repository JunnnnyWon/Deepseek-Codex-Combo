import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface EvidenceTarget {
  readonly file: string;
  readonly root: string;
}

export const evidenceTarget = (sessionId: string, fileName: string): EvidenceTarget => {
  const root = join(".dcc", "evidence", sessionId);
  return {
    file: join(root, fileName),
    root,
  };
};

export const ensureEvidenceRoot = async (target: EvidenceTarget): Promise<void> => {
  await mkdir(target.root, { recursive: true });
};
