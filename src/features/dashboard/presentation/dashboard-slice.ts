import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type { UserProfile } from '@/features/auth/domain/user-profile';
import type {
  DashboardRepository,
  DashboardSnapshot,
} from '@/features/dashboard/domain/dashboard';
import type {
  ExitPollRepository,
  RegisterExitPollInput,
} from '@/features/dashboard/domain/exit-poll';
import type { NetworkStatus } from '@/features/offline/domain/network-status';
import type { OfflineQueue } from '@/features/offline/domain/offline-queue';

type DashboardThunkState = {
  auth: { profile: UserProfile | null };
};

type DashboardDependencies = {
  createDashboardRepository: (profile: UserProfile) => DashboardRepository;
  exitPollRepository: ExitPollRepository;
  networkStatus: NetworkStatus;
  queue: OfflineQueue;
};

type DashboardState = {
  snapshot: DashboardSnapshot | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  exitPollStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  exitPollError: string | null;
  exitPollSavedOffline: boolean;
};

const initialState: DashboardState = {
  snapshot: null,
  status: 'idle',
  error: null,
  exitPollStatus: 'idle',
  exitPollError: null,
  exitPollSavedOffline: false,
};

export const loadDashboard = createAsyncThunk<
  DashboardSnapshot,
  void,
  { state: DashboardThunkState; extra: DashboardDependencies }
>('dashboard/load', async (_, { extra, getState }) => {
  const profile = getState().auth.profile;
  if (!profile) {
    throw new Error('No hay una sesión activa para consultar los resultados.');
  }
  return extra.createDashboardRepository(profile).load();
});

export const registerExitPoll = createAsyncThunk<
  { savedOffline: boolean },
  RegisterExitPollInput,
  { extra: DashboardDependencies }
>('dashboard/registerExitPoll', async (input, { extra }) => {
  if (!(await extra.networkStatus.isOnline())) {
    extra.queue.enqueue({
      type: 'exit_poll',
      payload: input as unknown as Record<string, unknown>,
    });
    return { savedOffline: true };
  }
  await extra.exitPollRepository.register(input);
  return { savedOffline: false };
});

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboardError(state) {
      state.status = 'idle';
      state.error = null;
      state.exitPollStatus = 'idle';
      state.exitPollError = null;
      state.exitPollSavedOffline = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadDashboard.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadDashboard.fulfilled, (state, action) => {
        state.snapshot = action.payload;
        state.status = 'succeeded';
      })
      .addCase(loadDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.error.message ?? 'No se pudo cargar el panel de resultados.';
      })
      .addCase(registerExitPoll.pending, (state) => {
        state.exitPollStatus = 'loading';
        state.exitPollError = null;
        state.exitPollSavedOffline = false;
      })
      .addCase(registerExitPoll.fulfilled, (state, action) => {
        state.exitPollStatus = 'succeeded';
        state.exitPollSavedOffline = action.payload.savedOffline;
      })
      .addCase(registerExitPoll.rejected, (state, action) => {
        state.exitPollStatus = 'failed';
        state.exitPollError =
          action.error.message ?? 'No se pudo registrar la respuesta.';
      });
  },
});

export const { clearDashboardError } = dashboardSlice.actions;
export default dashboardSlice.reducer;
