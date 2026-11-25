export type OfflineOperationType =
  | 'register_act'
  | 'upload_evidence'
  | 'process_ocr'
  | 'confirm_ocr'
  | 'apply_correction'
  | 'exit_poll';

export type OfflineOperationStatus = 'pending' | 'failed';

export type QueuedOperation = {
  id: number;
  type: OfflineOperationType;
  payload: Record<string, unknown>;
  localUri: string | null;
  status: OfflineOperationStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

export type EnqueueOfflineOperationInput = {
  type: OfflineOperationType;
  payload: Record<string, unknown>;
  localUri?: string | null;
};

export type LocalStateEntry = {
  key: string;
  value: string;
};

export interface OfflineQueue {
  enqueue(input: EnqueueOfflineOperationInput): QueuedOperation;
  list(): QueuedOperation[];
  update(
    id: number,
    patch: Partial<Pick<QueuedOperation, 'status' | 'attempts' | 'lastError' | 'payload'>>,
  ): void;
  remove(id: number): void;
  getState(key: string): string | null;
  setState(key: string, value: string): void;
  listStates(prefix: string): LocalStateEntry[];
  deleteState(key: string): void;
}
