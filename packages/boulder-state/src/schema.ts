export type BoulderSessionStatus = "active" | "blocked" | "complete" | "failed";
export type BoulderItemStatus = "done" | "pending";

export interface BoulderInactivePlan {
  readonly active: boolean;
  readonly createdAt: string;
  readonly planPath: string;
  readonly title: string;
}

export interface BoulderEvidenceItem {
  readonly evidence: readonly string[];
  readonly id: string;
  readonly status: BoulderItemStatus;
  readonly text?: string;
  readonly title?: string;
}

export interface BoulderSession {
  readonly acceptance: readonly BoulderEvidenceItem[];
  readonly createdAt: string;
  readonly modelProfile: string;
  readonly planPath: string;
  readonly status: BoulderSessionStatus;
  readonly tasks: readonly BoulderEvidenceItem[];
  readonly updatedAt: string;
}

export interface BoulderState {
  readonly activeSessionId?: string;
  readonly inactivePlans?: Readonly<Record<string, BoulderInactivePlan>>;
  readonly sessions: Readonly<Record<string, BoulderSession>>;
  readonly version: 1;
}

export class BoulderStateError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordField = (value: Record<string, unknown>, field: string): unknown => value[field];

const stringValue = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new BoulderStateError("boulder_schema_invalid", `${field} must be a non-empty string`);
  }
  return value;
};

const itemStatus = (value: unknown): BoulderItemStatus => {
  if (value === "done" || value === "pending") return value;
  throw new BoulderStateError("boulder_schema_invalid", "item status is invalid");
};

const sessionStatus = (value: unknown): BoulderSessionStatus => {
  if (value === "active" || value === "blocked" || value === "complete" || value === "failed") {
    return value;
  }
  throw new BoulderStateError("boulder_schema_invalid", "session status is invalid");
};

const evidenceList = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new BoulderStateError("boulder_schema_invalid", "evidence must be a string array");
  }
  return value;
};

const evidenceItem = (value: unknown): BoulderEvidenceItem => {
  if (!isRecord(value)) throw new BoulderStateError("boulder_schema_invalid");
  const rawText = recordField(value, "text");
  const rawTitle = recordField(value, "title");
  const text = typeof rawText === "string" ? rawText : undefined;
  const title = typeof rawTitle === "string" ? rawTitle : undefined;
  return {
    evidence: evidenceList(recordField(value, "evidence")),
    id: stringValue(recordField(value, "id"), "id"),
    status: itemStatus(recordField(value, "status")),
    ...(text === undefined ? {} : { text }),
    ...(title === undefined ? {} : { title }),
  };
};

const evidenceItems = (value: unknown, field: string): readonly BoulderEvidenceItem[] => {
  if (!Array.isArray(value)) {
    throw new BoulderStateError("boulder_schema_invalid", `${field} must be an array`);
  }
  return value.map((item) => evidenceItem(item));
};

const inactivePlanValue = (value: unknown): BoulderInactivePlan => {
  if (!isRecord(value)) throw new BoulderStateError("boulder_schema_invalid");
  return {
    active: recordField(value, "active") === true,
    createdAt: stringValue(recordField(value, "createdAt"), "createdAt"),
    planPath: stringValue(recordField(value, "planPath"), "planPath"),
    title: stringValue(recordField(value, "title"), "title"),
  };
};

const sessionValue = (value: unknown): BoulderSession => {
  if (!isRecord(value)) throw new BoulderStateError("boulder_schema_invalid");
  return {
    acceptance: evidenceItems(recordField(value, "acceptance"), "acceptance"),
    createdAt: stringValue(recordField(value, "createdAt"), "createdAt"),
    modelProfile: stringValue(recordField(value, "modelProfile"), "modelProfile"),
    planPath: stringValue(recordField(value, "planPath"), "planPath"),
    status: sessionStatus(recordField(value, "status")),
    tasks: evidenceItems(recordField(value, "tasks"), "tasks"),
    updatedAt: stringValue(recordField(value, "updatedAt"), "updatedAt"),
  };
};

const inactivePlansValue = (
  value: Record<string, unknown>,
): Record<string, BoulderInactivePlan> => {
  const result: Record<string, BoulderInactivePlan> = {};
  for (const [planPath, plan] of Object.entries(value)) {
    result[planPath] = inactivePlanValue(plan);
  }
  return result;
};

const sessionsValue = (value: Record<string, unknown>): Record<string, BoulderSession> => {
  const result: Record<string, BoulderSession> = {};
  for (const [id, session] of Object.entries(value)) {
    result[id] = sessionValue(session);
  }
  return result;
};

export const parseBoulderState = (value: unknown): BoulderState => {
  if (!isRecord(value)) {
    throw new BoulderStateError("boulder_schema_invalid");
  }
  const rawVersion = recordField(value, "version");
  const rawSessions = recordField(value, "sessions");
  if (rawVersion !== 1 || !isRecord(rawSessions)) {
    throw new BoulderStateError("boulder_schema_invalid");
  }
  const rawActiveSessionId = recordField(value, "activeSessionId");
  const rawInactivePlans = recordField(value, "inactivePlans");
  const activeSessionId = typeof rawActiveSessionId === "string" ? rawActiveSessionId : undefined;
  const inactivePlans = isRecord(rawInactivePlans) ? inactivePlansValue(rawInactivePlans) : {};
  const sessions = sessionsValue(rawSessions);
  return {
    ...(activeSessionId === undefined ? {} : { activeSessionId }),
    ...(Object.keys(inactivePlans).length === 0 ? {} : { inactivePlans }),
    sessions,
    version: 1,
  };
};

export const emptyBoulderState = (): BoulderState => ({
  sessions: {},
  version: 1,
});
