import type { ActConfirmationRepository } from '@/features/acts/domain/act-confirmation';
import type { ActOcrRepository } from '@/features/acts/domain/act-ocr';
import type { ElectoralActRepository } from '@/features/acts/domain/electoral-act-registration';
import type { ExitPollRepository } from '@/features/dashboard/domain/exit-poll';
import type { EvidenceRepository } from '@/features/evidence/domain/evidence-persistence';
import type { ErrorReporter } from '@/features/monitoring/domain/error-reporter';
import type { NetworkStatus } from '@/features/offline/domain/network-status';
import type {
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
};

export type SyncResult = {
  online: boolean;
  processed: number;
  failed: number;
};

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

export class OfflineSyncWorker {
  private running = false;

  constructor(private readonly dependencies: SyncWorkerDependencies) {}

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
      for (const operation of this.dependencies.queue.list()) {
        try {
          await this.process(operation);
          this.dependencies.queue.remove(operation.id);
          processed += 1;
        } catch (error) {
          failed += 1;
          this.dependencies.queue.update(operation.id, {
            status: 'failed',
            attempts: operation.attempts + 1,
            lastError:
              error instanceof Error ? error.message : 'Error desconocido.',
          });
          await this.dependencies.errorReporter.report(error, {
            screen: 'Sincronización offline',
            operation: operation.type,
            details: { operationId: operation.id },
          });
        }
      }
    } finally {
      this.running = false;
    }

    return { online: true, processed, failed };
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
