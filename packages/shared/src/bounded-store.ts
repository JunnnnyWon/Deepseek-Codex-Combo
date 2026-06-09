export interface BoundedStoreOptions {
  readonly maxEntriesPerSession: number;
  readonly now?: () => number;
  readonly ttlMs: number;
}

export interface BoundedStore<Value> {
  readonly get: (sessionId: string, key: string) => Value | undefined;
  readonly purgeExpired: () => void;
  readonly set: (sessionId: string, key: string, value: Value) => void;
}

interface StoredEntry<Value> {
  readonly expiresAt: number;
  readonly updatedAt: number;
  readonly value: Value;
}

const createSessionEntries = <Value>(
  sessions: Map<string, Map<string, StoredEntry<Value>>>,
  sessionId: string,
): Map<string, StoredEntry<Value>> => {
  const existing = sessions.get(sessionId);
  if (existing !== undefined) {
    return existing;
  }

  const created = new Map<string, StoredEntry<Value>>();
  sessions.set(sessionId, created);
  return created;
};

const removeExpiredFromSession = <Value>(
  entries: Map<string, StoredEntry<Value>>,
  timestamp: number,
): void => {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= timestamp) {
      entries.delete(key);
    }
  }
};

const enforceCapacity = <Value>(
  entries: Map<string, StoredEntry<Value>>,
  maxEntriesPerSession: number,
): void => {
  while (entries.size > maxEntriesPerSession) {
    let oldestKey: string | undefined;
    let oldestUpdatedAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of entries) {
      if (entry.updatedAt < oldestUpdatedAt) {
        oldestKey = key;
        oldestUpdatedAt = entry.updatedAt;
      }
    }

    if (oldestKey === undefined) {
      return;
    }

    entries.delete(oldestKey);
  }
};

export const createBoundedStore = <Value>(options: BoundedStoreOptions): BoundedStore<Value> => {
  const sessions = new Map<string, Map<string, StoredEntry<Value>>>();
  const now = options.now ?? Date.now;

  const purgeExpired = (): void => {
    const timestamp = now();
    for (const [sessionId, entries] of sessions) {
      removeExpiredFromSession(entries, timestamp);
      if (entries.size === 0) {
        sessions.delete(sessionId);
      }
    }
  };

  return {
    get: (sessionId, key) => {
      const entries = sessions.get(sessionId);
      if (entries === undefined) {
        return undefined;
      }

      removeExpiredFromSession(entries, now());
      const entry = entries.get(key);
      return entry?.value;
    },
    purgeExpired,
    set: (sessionId, key, value) => {
      const timestamp = now();
      const entries = createSessionEntries(sessions, sessionId);
      removeExpiredFromSession(entries, timestamp);
      entries.set(key, {
        expiresAt: timestamp + options.ttlMs,
        updatedAt: timestamp,
        value,
      });
      enforceCapacity(entries, options.maxEntriesPerSession);
    },
  };
};
