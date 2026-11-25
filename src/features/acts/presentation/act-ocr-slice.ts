import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { processActOcr as processActOcrUseCase } from '@/features/acts/application/process-act-ocr';
import type {
  ActOcrRepository,
  ActOcrRequest,
  ActOcrResult,
} from '@/features/acts/domain/act-ocr';
import type { OfflineQueue } from '@/features/offline/domain/offline-queue';

type ActOcrThunkDependencies = {
  actOcrRepository: ActOcrRepository;
  queue: OfflineQueue;
};

type ActOcrState = {
  result: ActOcrResult | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: ActOcrState = {
  result: null,
  status: 'idle',
  error: null,
};

export const requestActOcr = createAsyncThunk<
  ActOcrResult,
  ActOcrRequest,
  { extra: ActOcrThunkDependencies }
>(
  'acts/processOcr',
  async (input, { extra, signal }) => {
    // La evidencia es inmutable: reutilizar el OCR ya obtenido evita llamadas
    // repetidas a Gemini. La revisión humana sigue siendo obligatoria (S-06).
    const cached = extra.queue.getState(`ocr_result.${input.evidenceId}`);
    if (cached) {
      try {
        const parsed: unknown = JSON.parse(cached);
        if (isOcrResult(parsed, input)) {
          return parsed;
        }
      } catch {
        // Un valor dañado se ignora y se vuelve a procesar con Gemini.
      }
    }
    return processActOcrUseCase(extra.actOcrRepository, input, signal);
  },
);

function isOcrResult(value: unknown, request: ActOcrRequest): value is ActOcrResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as ActOcrResult;
  return (
    result.actId === request.actId &&
    result.evidenceId === request.evidenceId &&
    typeof result.position?.name === 'string' &&
    Array.isArray(result.results) &&
    typeof result.blankVotes !== 'undefined' &&
    typeof result.nullVotes !== 'undefined' &&
    typeof result.totalVotes !== 'undefined' &&
    Array.isArray(result.warnings)
  );
}

export const loadQueuedActOcrResult = createAsyncThunk<
  ActOcrResult,
  ActOcrRequest,
  { extra: ActOcrThunkDependencies }
>('acts/loadQueuedOcrResult', async (request, { extra }) => {
  const saved = extra.queue.getState(`ocr_result.${request.evidenceId}`);
  if (!saved) {
    throw new Error(
      'El reconocimiento todavía no está disponible. Sincroniza la información pendiente e inténtalo nuevamente.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    throw new Error('El reconocimiento guardado en el dispositivo no es válido.');
  }
  if (!isOcrResult(parsed, request)) {
    throw new Error('El reconocimiento guardado no corresponde a esta evidencia.');
  }
  return parsed;
});

const actOcrSlice = createSlice({
  name: 'actOcr',
  initialState,
  reducers: {
    clearActOcr(state) {
      state.result = null;
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(requestActOcr.pending, (state) => {
        state.result = null;
        state.status = 'loading';
        state.error = null;
      })
      .addCase(requestActOcr.fulfilled, (state, action) => {
        state.result = action.payload;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(requestActOcr.rejected, (state, action) => {
        state.result = null;
        state.status = 'failed';
        state.error =
          action.error.message ?? 'No se pudo procesar la fotografía del acta.';
      })
      .addCase(loadQueuedActOcrResult.pending, (state) => {
        state.result = null;
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadQueuedActOcrResult.fulfilled, (state, action) => {
        state.result = action.payload;
        state.status = 'succeeded';
      })
      .addCase(loadQueuedActOcrResult.rejected, (state, action) => {
        state.result = null;
        state.status = 'failed';
        state.error = action.error.message ?? 'No se pudo leer el reconocimiento.';
      });
  },
});

export const { clearActOcr } = actOcrSlice.actions;
export default actOcrSlice.reducer;
