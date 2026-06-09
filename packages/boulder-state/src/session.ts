import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evidenceDirForSession } from "./evidence.ts";
import type { BoulderState } from "./schema.ts";
import {
  type BoulderSession,
  BoulderStateError,
  emptyBoulderState,
  parseBoulderState,
} from "./schema.ts";

export interface StartBoulderSessionInput {
  readonly cwd: string;
  readonly modelProfile?: string;
  readonly now?: string;
  readonly planPath: string;
  readonly sessionId?: string;
}

export interface StartedBoulderSession {
  readonly evidenceDir: string;
  readonly session: BoulderSession & { readonly id: string };
  readonly state: BoulderState;
}

const boulderPath = (cwd: string): string => join(cwd, ".dcc", "boulder.json");

const generatedSessionId = (now: string): string => `dcc_${now.replace(/\D/g, "").slice(0, 14)}`;

const readState = async (cwd: string): Promise<BoulderState> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(boulderPath(cwd), "utf8"));
    return parseBoulderState(parsed);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return emptyBoulderState();
    }
    throw error;
  }
};

const writeState = async (cwd: string, state: BoulderState): Promise<void> => {
  const dccRoot = join(cwd, ".dcc");
  const target = boulderPath(cwd);
  const tmp = `${target}.tmp`;
  await mkdir(dccRoot, { recursive: true });
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmp, target);
};

export const startBoulderSession = async (
  input: StartBoulderSessionInput,
): Promise<StartedBoulderSession> => {
  const now = input.now ?? new Date().toISOString();
  const state = await readState(input.cwd);
  const active =
    state.activeSessionId === undefined ? undefined : state.sessions[state.activeSessionId];

  if (active?.status === "active" && input.sessionId === undefined) {
    throw new BoulderStateError(
      "active_session_exists",
      `active_session_exists: ${state.activeSessionId}`,
    );
  }

  const sessionId = input.sessionId ?? generatedSessionId(now);
  if (state.sessions[sessionId] !== undefined) {
    throw new BoulderStateError("session_exists", `session_exists: ${sessionId}`);
  }

  const session: BoulderSession = {
    acceptance: [],
    createdAt: now,
    modelProfile: input.modelProfile ?? "deepseek-pro",
    planPath: input.planPath,
    status: "active",
    tasks: [],
    updatedAt: now,
  };
  const nextState: BoulderState = {
    activeSessionId: sessionId,
    ...(state.inactivePlans === undefined ? {} : { inactivePlans: state.inactivePlans }),
    sessions: { ...state.sessions, [sessionId]: session },
    version: 1,
  };
  const evidenceDir = evidenceDirForSession(sessionId);

  await mkdir(join(input.cwd, evidenceDir), { recursive: true });
  await writeState(input.cwd, nextState);
  return { evidenceDir, session: { ...session, id: sessionId }, state: nextState };
};
