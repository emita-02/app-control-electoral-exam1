import type { ActConfirmationRepository } from '@/features/acts/domain/act-confirmation';
import type { ActOcrRepository } from '@/features/acts/domain/act-ocr';
import type { ElectoralActRepository } from '@/features/acts/domain/electoral-act-registration';
import type { ExitPollRepository } from '@/features/dashboard/domain/exit-poll';
import type { EvidenceRepository } from '@/features/evidence/domain/evidence-persistence';
import type { ErrorReporter } from '@/features/monitoring/domain/error-reporter';
import type { NetworkStatus } from '@/features/offline/domain/network-status';
import type {
  OfflineOperationType,
  OfflineQueue,
  QueuedOperation,
} from '@/features/offline/domain/offline-queue';

export type SyncWorkerDependencies = {
  queue: OfflineQueue;
  networkStatus: NetworkStatus;
  electoralActRepository: ElectoralActRepository;
  evidenceRepository: EvidenceRepository;
  confirmationRepository: ActConfirmationRepository;
  exitPollRepository: ExitPollRepository;
  actOcrRepository: ActOcrRepository;
  errorReporter: ErrorReporter;
  /** Devuelve el usuario autenticado. Se usa para no sincronizar operaciones de otra cuenta. */
  getCurrentUserId?: () => string | null;
};

export type SyncResult = {
  online: boolean;
  processed: number;
  failed: number;
};

/** ADR-02: la fase 1 prepara datos y OCR; la fase 2 cierra confirmaciones humanas. */
export const SYNC_PHASES: readonly (readonly OfflineOperationType[])[] = [
  ['register_act', 'upload_evidence', 'process_ocr'],
  ['confirm_ocr', 'apply_correction', 'exit_poll'],
];

export const MAX_SYNC_ATTEMPTS = 5;

const phasePriority = new Map<OfflineOperationType, number>(
  SYNC_PHASES.flatMap((types, phaseIndex) =>
    types.map((type, typeIndex) => [type, phaseIndex * 100 + typeIndex] as const),
  ),
);

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`La operación pendiente tiene un valor inválido en ${field}.`);
  }
  return value;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`La operación pendiente tiene un valor inválido en ${field}.`);
  }
  return value;
}

/** Retroceso exponencial acotado: 1, 2, 4, 8 y 16 minutos. */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 4));
  return 2 ** exponent * 60_000;
}

function operationSignature(operation: QueuedOperation): string {
  return JSON.stringify({ type: operation.type, payload: operation.payload });
}

export class OfflineSyncWorker {
  private running = false;
  private readonly dependencies: SyncWorkerDependencies;

  constructor(dependencies: SyncWorkerDependencies) {
    this.dependencies = dependencies;
  }

  async sync(): Promise<SyncResult> {
    if (this.running) {
      return { online: true, processed: 0, failed: 0 };
    }

    const online = await this.dependencies.networkStatus.isOnline();
    if (!online) {
      return { online: false, processed: 0, failed: 0 };
    }

    this.running = true;
    let processed = 0;
    let failed = 0;

    try {
      for (const allowedTypes of SYNC_PHASES) {
        const phaseResult = await this.runPhase(allowedTypes);
        processed += phaseResult.processed;
        failed += phaseResult.failed;
      }
    } finally {
      this.running = false;
    }

    return { online: true, processed, failed };
  }

  private isRetryDue(operation: QueuedOperation): boolean {
    const retryAfter = this.dependencies.queue.getState(
      `retry_after.${operation.id}`,
    );
    if (!retryAfter) {
      return true;
    }
    const timestamp = Date.parse(retryAfter);
    return !Number.isFinite(timestamp) || timestamp <= Date.now();
  }

  private isEligible(operation: QueuedOperation): boolean {
    if (operation.attempts >= MAX_SYNC_ATTEMPTS) {
      return false;
    }
    return this.isRetryDue(operation);
  }

  private async runPhase(
    allowedTypes: readonly OfflineOperationType[],
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    // Se vuelve a consultar la cola en cada iteración: `upload_evidence` puede
    // generar un `process_ocr` que debe resolverse dentro de la misma fase.
    for (;;) {
      const operation = this.dependencies.queue
        .list()
        .filter((item) => allowedTypes.includes(item.type))
        .filter((item) => this.isEligible(item))
        .sort(
          (a, b) =>
            (phasePriority.get(a.type) ?? 999) -
              (phasePriority.get(b.type) ?? 999) ||
            a.id - b.id,
        )[0];

      if (!operation) {
        break;
      }

      const ownerId = operation.payload.__ownerId;
      const currentUserId = this.dependencies.getCurrentUserId?.() ?? null;
      if (
        typeof ownerId === 'string' &&
        currentUserId !== null &&
        ownerId !== currentUserId
      ) {
        failed += 1;
        const message =
          'Esta operación pertenece a otra cuenta. Inicia sesión con el usuario que la creó.';
        this.dependencies.queue.update(operation.id, {
          status: 'failed',
          attempts: MAX_SYNC_ATTEMPTS,
          lastError: message,
        });
        await this.dependencies.errorReporter.report(new Error(message), {
          screen: 'Sincronización offline',
          operation: operation.type,
          details: { operationId: operation.id, reason: 'owner_mismatch' },
        });
        continue;
      }

      const signature = operationSignature(operation);
      if (
        operation.attempts > 0 &&
        this.dependencies.queue.getState(`synced.${signature}`) === '1'
      ) {
        // Ya se envió antes; no se reenvía aunque quedara una copia en la cola.
        this.dependencies.queue.remove(operation.id);
        processed += 1;
        continue;
      }

      try {
        await this.process(operation);
        this.dependencies.queue.setState(`synced.${signature}`, '1');
        this.dependencies.queue.deleteState(`retry_after.${operation.id}`);
        this.dependencies.queue.remove(operation.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        const attempts = operation.attempts + 1;
        this.dependencies.queue.update(operation.id, {
          status: 'failed',
          attempts,
          lastError:
            error instanceof Error ? error.message : 'Error desconocido.',
        });
        this.dependencies.queue.setState(
          `retry_after.${operation.id}`,
          new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
        );
        await this.dependencies.errorReporter.report(error, {
          screen: 'Sincronización offline',
          operation: operation.type,
          details: { operationId: operation.id, attempts },
        });
      }
    }

    return { processed, failed };
  }

  private resolveActId(value: unknown): number {
    const raw = readNumber(value, 'actId');
    if (raw > 0) {
      return raw;
    }
    const mapped = this.dependencies.queue.getState(`act_id_map.${raw}`);
    if (!mapped) {
      throw new Error('El acta local todavía no tiene un identificador remoto.');
    }
    return readNumber(Number(mapped), 'actId remoto');
  }

  private resolveEvidenceId(value: unknown): number {
    const raw = readNumber(value, 'evidenceId');
    if (raw > 0) {
      return raw;
    }
    const mapped = this.dependencies.queue.getState(`evidence_id_map.${raw}`);
    if (!mapped) {
      throw new Error(
        'La evidencia local todavía no tiene un identificador remoto.',
      );
    }
    return readNumber(Number(mapped), 'evidenceId remoto');
  }

  private async process(operation: QueuedOperation): Promise<void> {
    const payload = operation.payload;

    if (operation.type === 'register_act') {
      const input = payload as Parameters<
        ElectoralActRepository['register']
      >[0];
      const act = await this.dependencies.electoralActRepository.register(input);
      const localId = payload.__localId;
      if (typeof localId === 'number' && localId < 0) {
        this.dependencies.queue.setState(`act_id_map.${localId}`, String(act.id));
      }
      return;
    }

    if (operation.type === 'upload_evidence') {
      const localEvidenceId = readNumber(
        payload.__localEvidenceId ?? payload.evidenceId,
        '__localEvidenceId',
      );
      const actId = this.resolveActId(payload.localActId ?? payload.actId);
      const result = await this.dependencies.evidenceRepository.upload({
        actId,
        localUri:
          operation.localUri ?? readString(payload.localUri, 'localUri'),
        capturedAt: readString(payload.capturedAt, 'capturedAt'),
        latitude: readNumber(payload.latitude, 'latitude'),
        longitude: readNumber(payload.longitude, 'longitude'),
      });
      this.dependencies.queue.setState(
        `evidence_id_map.${localEvidenceId}`,
        String(result.evidenceId),
      );

      const alreadyQueued = this.dependencies.queue
        .list()
        .some(
          (item) =>
            item.type === 'process_ocr' &&
            item.payload.__localEvidenceId === localEvidenceId,
        );
      if (!alreadyQueued) {
        this.dependencies.queue.enqueue({
          type: 'process_ocr',
          payload: {
            actId: result.actId,
            evidenceId: result.evidenceId,
            __localEvidenceId: localEvidenceId,
            __ownerId: payload.__ownerId ?? null,
          },
        });
      }
      return;
    }

    if (operation.type === 'process_ocr') {
      const actId = this.resolveActId(payload.actId);
      const evidenceId = this.resolveEvidenceId(payload.evidenceId);
      const result = await this.dependencies.actOcrRepository.process({
        actId,
        evidenceId,
      });
      const localEvidenceId = payload.__localEvidenceId ?? evidenceId;
      this.dependencies.queue.setState(
        `ocr_result.${localEvidenceId}`,
        JSON.stringify(result),
      );
      this.dependencies.queue.setState(
        `ocr_review.${localEvidenceId}`,
        JSON.stringify({ actId, evidenceId }),
      );
      return;
    }

    if (
      operation.type === 'confirm_ocr' ||
      operation.type === 'apply_correction'
    ) {
      const input = payload as Parameters<
        ActConfirmationRepository['confirm']
      >[0];
      await this.dependencies.confirmationRepository.confirm({
        ...input,
        actId: this.resolveActId(input.actId),
      });
      return;
    }

    if (operation.type === 'exit_poll') {
      await this.dependencies.exitPollRepository.register(
        payload as Parameters<ExitPollRepository['register']>[0],
      );
      return;
    }

    throw new Error('Tipo de operación pendiente no reconocido.');
  }
}
