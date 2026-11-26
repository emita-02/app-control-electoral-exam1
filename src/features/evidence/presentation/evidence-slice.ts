import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { captureEvidence as captureEvidenceUseCase } from '@/features/evidence/application/capture-evidence';
import type {
  CapturedEvidence,
  EvidenceCaptureInput,
} from '@/features/evidence/domain/evidence';
import type { EvidenceCaptureDependencies } from '@/features/evidence/application/capture-evidence';
import type { EvidenceFileStore } from '@/features/evidence/domain/evidence-file-store';
import type { EvidenceRepository } from '@/features/evidence/domain/evidence-persistence';
import type { NetworkStatus } from '@/features/offline/domain/network-status';
import type { OfflineQueue } from '@/features/offline/domain/offline-queue';

type EvidenceThunkDependencies = {
  evidenceCaptureDependencies: EvidenceCaptureDependencies;
  evidenceFileStore: EvidenceFileStore;
  evidenceRepository: EvidenceRepository;
  networkStatus: NetworkStatus;
  queue: OfflineQueue;
};

type UploadEvidenceResult = {
  actId: number;
  evidenceId: number;
  storagePath: string | null;
  savedOffline: boolean;
};

type EvidenceState = {
  captures: CapturedEvidence[];
  captureStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  captureError: string | null;
  uploadStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  uploadError: string | null;
  uploadedEvidence: UploadEvidenceResult | null;
};

const initialState: EvidenceState = {
  captures: [],
  captureStatus: 'idle',
  captureError: null,
  uploadStatus: 'idle',
  uploadError: null,
  uploadedEvidence: null,
};

export const captureEvidence = createAsyncThunk<
  CapturedEvidence,
  EvidenceCaptureInput,
  { extra: EvidenceThunkDependencies }
>(
  'evidence/capture',
  async (input, { extra }) => {
    const capture = await captureEvidenceUseCase(
      extra.evidenceCaptureDependencies,
      input,
    );
    const persistentUri = await extra.evidenceFileStore.persist(capture.localUri);
    return { ...capture, localUri: persistentUri };
  },
);

export type UploadEvidenceInput = CapturedEvidence & { actId: number };

export const uploadEvidenceForAct = createAsyncThunk<
  UploadEvidenceResult,
  UploadEvidenceInput,
  { extra: EvidenceThunkDependencies }
>('evidence/uploadForAct', async (input, { extra }) => {
  if (!Number.isSafeInteger(input.actId) || input.actId === 0) {
    throw new Error('La fotografía no tiene un acta válida asociada.');
  }
  // Un ID negativo identifica un acta local pendiente de sincronización:
  // se encola aunque la red ya esté disponible para que el worker resuelva
  // primero el ID remoto del acta (ADR-02).
  const isLocalAct = input.actId < 0;
  if (isLocalAct || !(await extra.networkStatus.isOnline())) {
    const localEvidenceId = -Date.now();
    extra.queue.enqueue({
      type: 'upload_evidence',
      payload: {
        __localEvidenceId: localEvidenceId,
        __ownerId: input.userId,
        localActId: input.actId,
        localUri: input.localUri,
        capturedAt: input.capturedAt,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      localUri: input.localUri,
    });
    return {
      actId: input.actId,
      evidenceId: localEvidenceId,
      storagePath: null,
      savedOffline: true,
    };
  }

  const uploaded = await extra.evidenceRepository.upload({
    actId: input.actId,
    localUri: input.localUri,
    capturedAt: input.capturedAt,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  return { ...uploaded, savedOffline: false };
});

const evidenceSlice = createSlice({
  name: 'evidence',
  initialState,
  reducers: {
    clearEvidenceCaptureError(state) {
      state.captureError = null;
      state.captureStatus = 'idle';
    },
    clearEvidenceUploadResult(state) {
      state.uploadStatus = 'idle';
      state.uploadError = null;
      state.uploadedEvidence = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(captureEvidence.pending, (state) => {
        state.captureStatus = 'loading';
        state.captureError = null;
      })
      .addCase(captureEvidence.fulfilled, (state, action) => {
        state.captures.unshift(action.payload);
        state.captureStatus = 'succeeded';
        state.captureError = null;
      })
      .addCase(captureEvidence.rejected, (state, action) => {
        state.captureStatus = 'failed';
        state.captureError =
          action.error.message ?? 'No se pudo completar la captura de evidencia.';
      })
      .addCase(uploadEvidenceForAct.pending, (state) => {
        state.uploadStatus = 'loading';
        state.uploadError = null;
        state.uploadedEvidence = null;
      })
      .addCase(uploadEvidenceForAct.fulfilled, (state, action) => {
        state.uploadStatus = 'succeeded';
        state.uploadedEvidence = action.payload;
      })
      .addCase(uploadEvidenceForAct.rejected, (state, action) => {
        state.uploadStatus = 'failed';
        state.uploadError =
          action.error.message ?? 'No se pudo registrar la evidencia.';
      });
  },
});

export const {
  clearEvidenceCaptureError,
  clearEvidenceUploadResult,
} = evidenceSlice.actions;
export default evidenceSlice.reducer;
