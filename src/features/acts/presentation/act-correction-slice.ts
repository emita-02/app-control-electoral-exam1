import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type {
  ActCorrectionContextData,
  ActCorrectionRepository,
} from '@/features/acts/domain/act-correction-record';

type ActCorrectionDependencies = {
  actCorrectionRepository: ActCorrectionRepository;
};

type ActCorrectionState = {
  context: ActCorrectionContextData | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: ActCorrectionState = {
  context: null,
  status: 'idle',
  error: null,
};

export const loadActCorrection = createAsyncThunk<
  ActCorrectionContextData,
  number,
  { extra: ActCorrectionDependencies }
>('acts/loadCorrection', async (actId, { extra }) =>
  extra.actCorrectionRepository.load(actId),
);

const actCorrectionSlice = createSlice({
  name: 'actCorrection',
  initialState,
  reducers: {
    clearActCorrection(state) {
      state.context = null;
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadActCorrection.pending, (state) => {
        state.context = null;
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadActCorrection.fulfilled, (_state, action) => ({
        ..._state,
        context: action.payload,
        status: 'succeeded',
        error: null,
      }))
      .addCase(loadActCorrection.rejected, (state, action) => {
        state.context = null;
        state.status = 'failed';
        state.error =
          action.error.message ?? 'No se pudo cargar el acta para corregir.';
      });
  },
});

export const { clearActCorrection } = actCorrectionSlice.actions;
export default actCorrectionSlice.reducer;
