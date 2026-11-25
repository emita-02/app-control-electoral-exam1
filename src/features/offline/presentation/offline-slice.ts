import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type { OfflineSyncWorker } from '@/features/offline/application/sync-worker';
import type {
  OfflineQueue,
  QueuedOperation,
} from '@/features/offline/domain/offline-queue';

type OfflineThunkDependencies = {
  queue: OfflineQueue;
  syncWorker: OfflineSyncWorker;
};

export type OcrReviewEntry = {
  key: string;
  actId: number;
  evidenceId: number;
};

type OfflineSnapshot = {
  operations: QueuedOperation[];
  reviews: OcrReviewEntry[];
};

type OfflineState = OfflineSnapshot & {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastSyncAt: string | null;
  online: boolean;
};

const initialState: OfflineState = {
  operations: [],
  reviews: [],
  status: 'idle',
  error: null,
  lastSyncAt: null,
  online: false,
};

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function snapshot(queue: OfflineQueue): OfflineSnapshot {
  const reviews: OcrReviewEntry[] = [];
  for (const entry of queue.listStates('ocr_review.')) {
    try {
      const parsed: unknown = JSON.parse(entry.value);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        !isPositiveId((parsed as OcrReviewEntry).actId) ||
        !isPositiveId((parsed as OcrReviewEntry).evidenceId)
      ) {
        continue;
      }
      reviews.push({
        key: entry.key,
        actId: (parsed as OcrReviewEntry).actId,
        evidenceId: (parsed as OcrReviewEntry).evidenceId,
      });
    } catch {
      // Se ignora una entrada local dañada; no bloquea las demás revisiones.
    }
  }
  return { operations: queue.list(), reviews };
}

export const loadOfflineOperations = createAsyncThunk<
  OfflineSnapshot,
  void,
  { extra: OfflineThunkDependencies }
>('offline/load', async (_, { extra }) => snapshot(extra.queue));

export const syncOfflineOperations = createAsyncThunk<
  OfflineSnapshot & { processed: number; failed: number; online: boolean },
  void,
  { extra: OfflineThunkDependencies }
>('offline/sync', async (_, { extra }) => {
  const result = await extra.syncWorker.sync();
  return { ...snapshot(extra.queue), ...result };
});

export const retryOfflineOperation = createAsyncThunk<
  OfflineSnapshot,
  number,
  { extra: OfflineThunkDependencies }
>('offline/retry', async (id, { extra, dispatch }) => {
  extra.queue.update(id, { status: 'pending', lastError: null });
  await dispatch(syncOfflineOperations()).unwrap();
  return snapshot(extra.queue);
});

export const clearOcrReview = createAsyncThunk<
  OfflineSnapshot,
  string,
  { extra: OfflineThunkDependencies }
>('offline/clearOcrReview', async (key, { extra }) => {
  extra.queue.deleteState(key);
  return snapshot(extra.queue);
});

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    clearOfflineError(state) {
      state.error = null;
      if (state.status === 'failed') {
        state.status = 'idle';
      }
    },
    setOnline(state, action: { payload: boolean }) {
      state.online = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadOfflineOperations.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadOfflineOperations.fulfilled, (state, action) => {
        state.operations = action.payload.operations;
        state.reviews = action.payload.reviews;
        state.status = 'succeeded';
      })
      .addCase(loadOfflineOperations.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.error.message ?? 'No se pudo cargar la cola de sincronización.';
      })
      .addCase(syncOfflineOperations.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(syncOfflineOperations.fulfilled, (state, action) => {
        state.operations = action.payload.operations;
        state.reviews = action.payload.reviews;
        state.status = 'succeeded';
        state.lastSyncAt = new Date().toISOString();
        if (action.payload.online) {
          state.error =
            action.payload.failed > 0
              ? `${action.payload.failed} operación(es) necesitan revisión.`
              : null;
        }
      })
      .addCase(syncOfflineOperations.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.error.message ?? 'No se pudo sincronizar la cola local.';
      })
      .addCase(retryOfflineOperation.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(retryOfflineOperation.fulfilled, (state, action) => {
        state.operations = action.payload.operations;
        state.reviews = action.payload.reviews;
        state.status = 'succeeded';
      })
      .addCase(retryOfflineOperation.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.error.message ?? 'No se pudo reintentar la operación.';
      })
      .addCase(clearOcrReview.fulfilled, (state, action) => {
        state.operations = action.payload.operations;
        state.reviews = action.payload.reviews;
      });
  },
});

export const { clearOfflineError, setOnline } = offlineSlice.actions;
export default offlineSlice.reducer;
