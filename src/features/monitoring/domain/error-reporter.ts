export type ErrorReportContext = {
  screen?: string;
  operation?: string;
  details?: Record<string, string | number | boolean | null>;
};

export interface ErrorReporter {
  report(error: unknown, context?: ErrorReportContext): Promise<void>;
  countPending(): number;
  /** Entrega los reportes pendientes al proveedor remoto y devuelve cuántos se enviaron. */
  flush?(): Promise<number>;
}
