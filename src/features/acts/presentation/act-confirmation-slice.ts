import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type {
  ActConfirmationRepository,
  ConfirmActInput,
  ConfirmActResult,
} from '@/features/acts/domain/act-confirmation';
import type { OfflineQueue } from '@/features/offline/domain/offline-queue';
import type { NetworkStatus } from '@/features/offline/domain/network-status';

type ConfirmationDependencies = {
  confirmationRepository: ActConfirmationRepository;
  networkStatus: NetworkStatus;
  queue: OfflineQueue;
};

type ConfirmationState = {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  result: ConfirmActResult | null;
  savedOffline: boolean;
};

const initialState: ConfirmationState = {
  status: 'idle',
  error: null,
  result: null,
  savedOffline: false,
};

function resolveActId(queue: OfflineQueue, actId: number): number {
  if (actId > 0) {
    return actId;
  }
  const mapped = queue.getState(`act_id_map.${actId}`);
  if (!mapped) {
    throw new Error('El acta todavía no se ha sincronizado con el servidor.');
  }
  const resolved = Number(mapped);
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error('El identificador remoto del acta no es válido.');
  }
  return resolved;
}

export const confirmActResults = createAsyncThunk<
  ConfirmActResult & { savedOffline: boolean },
  ConfirmActInput,
  { extra: ConfirmationDependencies }
>('acts/confirmResults', async (input, { extra }) => {
  if (!(await extra.networkStatus.isOnline())) {
    extra.queue.enqueue({
      type: input.action,
      payload: input as unknown as Record<string, unknown>,
    });
    return {
      actId: input.actId,
      status: 'pendiente_sincronizacion',
      reviewedAt: new Date().toISOString(),
      correctionRegistered: false,
      savedOffline: true,
    };
  }

  const result = await extra.confirmationRepository.confirm({
    ...input,
    actId: resolveActId(extra.queue, input.actId),
  });
  return { ...result, savedOffline: false };
});

const actConfirmationSlice = createSlice({
  name: 'actConfirmation',
  initialState,
  reducers: {
    clearActConfirmation(state) {
      state.status = 'idle';
      state.error = null;
      state.result = null;
      state.savedOffline = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(confirmActResults.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.result = null;
        state.savedOffline = false;
      })
      .addCase(confirmActResults.fulfilled, (state, action) => {
        const { savedOffline, ...result } = action.payload;
        state.status = 'succeeded';
        state.result = result;
        state.savedOffline = savedOffline;
        state.error = null;
      })
      .addCase(confirmActResults.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.error.message ?? 'No se pudo confirmar el acta.';
      });
  },
});

export const { clearActConfirmation } = actConfirmationSlice.actions;
export default actConfirmationSlice.reducer;
