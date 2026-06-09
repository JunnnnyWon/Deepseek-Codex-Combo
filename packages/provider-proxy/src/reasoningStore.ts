export type ReasoningReference = {
  readonly reference: string;
};

export type ReasoningStoreEntry = {
  readonly expiresAtMs: number;
  readonly reference: string;
  readonly reasoningContent: string;
  readonly sessionId: string;
  readonly turnId: string;
};

export type ReasoningStoreSnapshotEntry = Omit<ReasoningStoreEntry, "reasoningContent">;

export type ReasoningStoreOptions = {
  readonly maxEntries: number;
  readonly now: () => number;
  readonly ttlMs: number;
};

export type ReasoningStore = {
  readonly cleanupSession: (sessionId: string) => void;
  readonly get: (input: {
    readonly reference: string;
    readonly sessionId: string;
  }) => string | undefined;
  readonly put: (input: {
    readonly reasoningContent: string;
    readonly sessionId: string;
    readonly turnId: string;
  }) => ReasoningReference;
  readonly size: () => number;
  readonly snapshot: () => readonly ReasoningStoreSnapshotEntry[];
};

const entryKey = (sessionId: string, reference: string): string => `${sessionId}:${reference}`;

export const createReasoningStore = (options: ReasoningStoreOptions): ReasoningStore => {
  const entries = new Map<string, ReasoningStoreEntry>();
  let nextReferenceSuffix = 0;

  const removeExpired = (): void => {
    const now = options.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAtMs <= now) entries.delete(key);
    }
  };

  const evictLru = (): void => {
    while (entries.size >= options.maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) return;
      entries.delete(oldestKey);
    }
  };

  return {
    cleanupSession: (sessionId) => {
      removeExpired();
      for (const [key, entry] of entries) {
        if (entry.sessionId === sessionId) entries.delete(key);
      }
    },
    get: ({ reference, sessionId }) => {
      removeExpired();
      const key = entryKey(sessionId, reference);
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.reasoningContent;
    },
    put: ({ reasoningContent, sessionId, turnId }) => {
      removeExpired();
      evictLru();
      const nowMs = options.now();
      const reference = `rsn_${turnId}_${nowMs}_${nextReferenceSuffix}`;
      nextReferenceSuffix += 1;
      const key = entryKey(sessionId, reference);
      entries.delete(key);
      entries.set(key, {
        expiresAtMs: nowMs + options.ttlMs,
        reasoningContent,
        reference,
        sessionId,
        turnId,
      });
      return { reference };
    },
    size: () => entries.size,
    snapshot: () => {
      removeExpired();
      return [...entries.values()].map(({ expiresAtMs, reference, sessionId, turnId }) => ({
        expiresAtMs,
        reference,
        sessionId,
        turnId,
      }));
    },
  };
};
