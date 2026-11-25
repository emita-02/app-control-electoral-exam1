import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  EnqueueOfflineOperationInput,
  LocalStateEntry,
  OfflineQueue,
  OfflineOperationStatus,
  OfflineOperationType,
  QueuedOperation,
} from '@/features/offline/domain/offline-queue';

type OperationRow = {
  id: number;
  type: string;
  payload: string;
  local_uri: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

let database: SQLiteDatabase | null = null;

function getDatabase(): SQLiteDatabase {
  if (!database) {
    database = openDatabaseSync('control-electoral-offline.db');
    database.execSync(`
      CREATE TABLE IF NOT EXISTS pending_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        local_uri TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS local_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
  return database;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readOperation(row: OperationRow): QueuedOperation {
  return {
    id: Number(row.id),
    type: row.type as OfflineOperationType,
    payload: parsePayload(row.payload),
    localUri: row.local_uri,
    status: row.status as OfflineOperationStatus,
    attempts: Number(row.attempts),
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

export class SQLiteOfflineQueue implements OfflineQueue {
  enqueue(input: EnqueueOfflineOperationInput): QueuedOperation {
    const createdAt = new Date().toISOString();
    const result = getDatabase().runSync(
      'INSERT INTO pending_operations (type, payload, local_uri, status, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      input.type,
      JSON.stringify(input.payload),
      input.localUri ?? null,
      'pending',
      createdAt,
    );

    return {
      id: Number(result.lastInsertRowId),
      type: input.type,
      payload: input.payload,
      localUri: input.localUri ?? null,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt,
    };
  }

  list(): QueuedOperation[] {
    const rows = getDatabase().getAllSync<OperationRow>(
      'SELECT id, type, payload, local_uri, status, attempts, last_error, created_at FROM pending_operations ORDER BY id ASC',
    );
    return rows.map(readOperation);
  }

  update(
    id: number,
    patch: Partial<
      Pick<QueuedOperation, 'status' | 'attempts' | 'lastError' | 'payload'>
    >,
  ): void {
    const current = getDatabase().getFirstSync<OperationRow>(
      'SELECT id, type, payload, local_uri, status, attempts, last_error, created_at FROM pending_operations WHERE id = ?',
      id,
    );
    if (!current) {
      return;
    }

    getDatabase().runSync(
      'UPDATE pending_operations SET payload = ?, status = ?, attempts = ?, last_error = ? WHERE id = ?',
      patch.payload ? JSON.stringify(patch.payload) : current.payload,
      patch.status ?? current.status,
      patch.attempts ?? current.attempts,
      patch.lastError === undefined ? current.last_error : patch.lastError,
      id,
    );
  }

  remove(id: number): void {
    getDatabase().runSync('DELETE FROM pending_operations WHERE id = ?', id);
  }

  getState(key: string): string | null {
    const row = getDatabase().getFirstSync<{ value: string }>(
      'SELECT value FROM local_state WHERE key = ?',
      key,
    );
    return row?.value ?? null;
  }

  setState(key: string, value: string): void {
    getDatabase().runSync(
      'INSERT INTO local_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }

  listStates(prefix: string): LocalStateEntry[] {
    const rows = getDatabase().getAllSync<LocalStateEntry>(
      'SELECT key, value FROM local_state WHERE substr(key, 1, ?) = ? ORDER BY key ASC',
      prefix.length,
      prefix,
    );
    return rows.map((row) => ({ key: String(row.key), value: String(row.value) }));
  }

  deleteState(key: string): void {
    getDatabase().runSync('DELETE FROM local_state WHERE key = ?', key);
  }
}
