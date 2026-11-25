import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  ErrorReportContext,
  ErrorReporter,
} from '@/features/monitoring/domain/error-reporter';

let database: SQLiteDatabase | null = null;

function getDatabase(): SQLiteDatabase {
  if (!database) {
    database = openDatabaseSync('control-electoral-errors.db');
    database.execSync(`
      CREATE TABLE IF NOT EXISTS error_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        screen TEXT,
        operation TEXT,
        details TEXT,
        created_at TEXT NOT NULL,
        sent INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  return database;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Error inesperado sin mensaje.';
}

export class SQLiteErrorReporter implements ErrorReporter {
  async report(error: unknown, context: ErrorReportContext = {}): Promise<void> {
    getDatabase().runSync(
      'INSERT INTO error_reports (message, screen, operation, details, created_at) VALUES (?, ?, ?, ?, ?)',
      messageFrom(error),
      context.screen ?? null,
      context.operation ?? null,
      context.details ? JSON.stringify(context.details) : null,
      new Date().toISOString(),
    );
  }

  countPending(): number {
    const row = getDatabase().getFirstSync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM error_reports WHERE sent = 0',
    );
    return Number(row?.count ?? 0);
  }

  /** Marca como entregados los reportes locales ya enviados al proveedor remoto. */
  markAllSent(): number {
    const result = getDatabase().runSync(
      'UPDATE error_reports SET sent = 1 WHERE sent = 0',
    );
    return Number(result.changes ?? 0);
  }

  async flush(): Promise<number> {
    return this.markAllSent();
  }
}
