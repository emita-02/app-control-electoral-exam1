import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { loadElectoralActCatalog } from '@/features/acts/application/electoral-act-registration';
import {
  registerElectoralAct,
  type ElectoralActCatalog,
  type ElectoralActRepository,
  type RegisterElectoralActInput,
  type RegisteredElectoralAct,
} from '@/features/acts/domain/electoral-act-registration';
import type { NetworkStatus } from '@/features/offline/domain/network-status';
import type { OfflineQueue } from '@/features/offline/domain/offline-queue';

type ActRegistrationDependencies = {
  electoralActRepository: ElectoralActRepository;
  networkStatus: NetworkStatus;
  queue: OfflineQueue;
};

type ActRegistrationState = {
  catalog: ElectoralActCatalog | null;
  catalogStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  catalogError: string | null;
  saveStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  saveError: string | null;
  savedAct: RegisteredElectoralAct | null;
  savedOffline: boolean;
};

const initialState: ActRegistrationState = {
  catalog: null,
  catalogStatus: 'idle',
  catalogError: null,
  saveStatus: 'idle',
  saveError: null,
  savedAct: null,
  savedOffline: false,
};

function parseCatalog(value: string | null): ElectoralActCatalog | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as ElectoralActCatalog).tables) &&
      Array.isArray((parsed as ElectoralActCatalog).positions) &&
      Array.isArray((parsed as ElectoralActCatalog).candidates)
    ) {
      return parsed as ElectoralActCatalog;
    }
  } catch {
    return null;
  }
  return null;
}

export const loadActRegistrationCatalog = createAsyncThunk<
  ElectoralActCatalog,
  string,
  { extra: ActRegistrationDependencies }
>(
  'acts/loadRegistrationCatalog',
  async (watcherId, { extra }) => {
    const cacheKey = `act_catalog.${watcherId}`;
    if (await extra.networkStatus.isOnline()) {
      const catalog = await loadElectoralActCatalog(
        extra.electoralActRepository,
        watcherId,
      );
      extra.queue.setState(cacheKey, JSON.stringify(catalog));
      return catalog;
    }

    const cached = parseCatalog(extra.queue.getState(cacheKey));
    if (!cached) {
      throw new Error(
        'No hay una versión local del catálogo electoral. Conéctate una vez para descargarlo.',
      );
    }
    return cached;
  },
);

export const submitElectoralAct = createAsyncThunk<
  { act: RegisteredElectoralAct; savedOffline: boolean },
  RegisterElectoralActInput,
  { extra: ActRegistrationDependencies }
>(
  'acts/register',
  async (input, { extra }) => {
    if (!(await extra.networkStatus.isOnline())) {
      const localId = -Date.now();
      extra.queue.enqueue({
        type: 'register_act',
        payload: { ...input, __localId: localId },
      });
      return {
        savedOffline: true,
        act: {
          id: localId,
          electoralTableId: input.electoralTableId,
          positionId: input.positionId,
          status: 'pendiente_sincronizacion',
          totalVotes: input.totalVotes,
          blankVotes: input.blankVotes,
          nullVotes: input.nullVotes,
          observation: input.observation,
          registeredBy: 'local',
          createdAt: new Date().toISOString(),
        },
      };
    }

    const result = await registerElectoralAct(
      extra.electoralActRepository,
      input,
    );
    if (!result.ok) {
      throw new Error(result.message);
    }
    return { act: result.act, savedOffline: false };
  },
);

const actRegistrationSlice = createSlice({
  name: 'actRegistration',
  initialState,
  reducers: {
    clearActRegistrationError(state) {
      state.catalogError = null;
      state.saveError = null;
      if (state.catalogStatus === 'failed') {
        state.catalogStatus = 'idle';
      }
      if (state.saveStatus === 'failed') {
        state.saveStatus = 'idle';
      }
    },
    clearSavedAct(state) {
      state.savedAct = null;
      state.saveStatus = 'idle';
      state.saveError = null;
      state.savedOffline = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadActRegistrationCatalog.pending, (state) => {
        state.catalogStatus = 'loading';
        state.catalogError = null;
      })
      .addCase(loadActRegistrationCatalog.fulfilled, (state, action) => {
        state.catalog = action.payload;
        state.catalogStatus = 'succeeded';
        state.catalogError = null;
      })
      .addCase(loadActRegistrationCatalog.rejected, (state, action) => {
        state.catalog = null;
        state.catalogStatus = 'failed';
        state.catalogError =
          action.error.message ??
          'No se pudo cargar la información necesaria para registrar actas.';
      })
      .addCase(submitElectoralAct.pending, (state) => {
        state.saveStatus = 'loading';
        state.saveError = null;
        state.savedAct = null;
        state.savedOffline = false;
      })
      .addCase(submitElectoralAct.fulfilled, (state, action) => {
        state.savedAct = action.payload.act;
        state.savedOffline = action.payload.savedOffline;
        state.saveStatus = 'succeeded';
        state.saveError = null;
      })
      .addCase(submitElectoralAct.rejected, (state, action) => {
        state.savedAct = null;
        state.savedOffline = false;
        state.saveStatus = 'failed';
        state.saveError =
          action.error.message ?? 'No se pudo registrar el acta.';
      });
  },
});

export const {
  clearActRegistrationError,
  clearSavedAct,
} = actRegistrationSlice.actions;
export default actRegistrationSlice.reducer;
