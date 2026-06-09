import type { BoulderEvidenceItem, BoulderState } from "./schema.ts";

export interface ContinuationResult {
  readonly exitCode: 0 | 2;
  readonly lines: readonly string[];
}

interface MissingEvidence {
  readonly id: string;
  readonly kind: "acceptance" | "task";
  readonly text: string;
}

const itemText = (item: BoulderEvidenceItem): string => item.text ?? item.title ?? item.id;

const missingItems = (
  items: readonly BoulderEvidenceItem[],
  kind: MissingEvidence["kind"],
): readonly MissingEvidence[] =>
  items
    .filter((item) => item.status !== "done" || item.evidence.length === 0)
    .map((item) => ({ id: item.id, kind, text: itemText(item) }));

export const evaluateContinuation = (state: BoulderState): ContinuationResult => {
  if (state.activeSessionId === undefined) {
    return {
      exitCode: 0,
      lines: [JSON.stringify({ decision: "approve", reason: "no_active_session" })],
    };
  }

  const session = state.sessions[state.activeSessionId];
  if (session === undefined) {
    return { exitCode: 2, lines: [JSON.stringify({ decision: "block", reason: "state_invalid" })] };
  }

  const missing = [
    ...missingItems(session.tasks, "task"),
    ...missingItems(session.acceptance, "acceptance"),
  ];

  if (session.status !== "complete" || missing.length > 0) {
    return {
      exitCode: 2,
      lines: [
        JSON.stringify({
          decision: "block",
          missing,
          reason: "missing_evidence",
          sessionId: state.activeSessionId,
        }),
      ],
    };
  }

  return {
    exitCode: 0,
    lines: [
      JSON.stringify({
        decision: "approve",
        reason: "evidence_complete",
        sessionId: state.activeSessionId,
      }),
    ],
  };
};
