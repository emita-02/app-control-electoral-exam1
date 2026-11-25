import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { createPersonnelMember } from '@/features/personnel/application/create-personnel-member';
import { saveWatcherAssignments } from '@/features/personnel/application/save-watcher-assignments';
import {
  authenticationFailed,
  sessionLoading,
  sessionUnauthenticated,
} from '@/features/auth/presentation/auth-slice';
import type {
  CreatePersonnelInput,
  PersonnelOverview,
  PersonnelRepository,
  SaveWatcherAssignmentsInput,
} from '@/features/personnel/domain/personnel';
import type { UserProfile } from '@/features/auth/domain/user-profile';

type PersonnelDependencies = {
  personnelRepository: PersonnelRepository;
};

type PersonnelState = {
  overview: PersonnelOverview | null;
  loadRequestId: string | null;
  loadStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  loadError: string | null;
  actionStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  actionError: string | null;
};

const initialState: PersonnelState = {
  overview: null,
  loadRequestId: null,
  loadStatus: 'idle',
  loadError: null,
  actionStatus: 'idle',
  actionError: null,
};

export const loadPersonnel = createAsyncThunk<
  PersonnelOverview,
  UserProfile,
  { extra: PersonnelDependencies }
>('personnel/load', async (profile, { extra }) =>
  extra.personnelRepository.load(profile),
);

export const createMember = createAsyncThunk<
  void,
  CreatePersonnelInput,
  { extra: PersonnelDependencies }
>('personnel/createMember', async (input, { extra }) =>
  createPersonnelMember(extra.personnelRepository, input),
);

export const updateAssignments = createAsyncThunk<
  void,
  SaveWatcherAssignmentsInput,
  { extra: PersonnelDependencies }
>('personnel/updateAssignments', async (input, { extra }) =>
  saveWatcherAssignments(extra.personnelRepository, input),
);

const personnelSlice = createSlice({
  name: 'personnel',
  initialState,
  reducers: {
    clearPersonnelAction(state) {
      state.actionStatus = 'idle';
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sessionLoading, (state) => {
        state.overview = null;
        state.loadRequestId = null;
        state.loadStatus = 'idle';
        state.loadError = null;
        state.actionStatus = 'idle';
        state.actionError = null;
      })
      .addCase(sessionUnauthenticated, (state) => {
        state.overview = null;
        state.loadRequestId = null;
        state.loadStatus = 'idle';
        state.loadError = null;
        state.actionStatus = 'idle';
        state.actionError = null;
      })
      .addCase(authenticationFailed, (state) => {
        state.overview = null;
        state.loadRequestId = null;
        state.loadStatus = 'idle';
        state.loadError = null;
        state.actionStatus = 'idle';
        state.actionError = null;
      })
      .addCase(loadPersonnel.pending, (state, action) => {
        state.overview = null;
        state.loadRequestId = action.meta.requestId;
        state.loadStatus = 'loading';
        state.loadError = null;
      })
      .addCase(loadPersonnel.fulfilled, (state, action) => {
        if (state.loadRequestId !== action.meta.requestId) {
          return;
        }
        state.overview = action.payload;
        state.loadRequestId = null;
        state.loadStatus = 'succeeded';
        state.loadError = null;
      })
      .addCase(loadPersonnel.rejected, (state, action) => {
        if (state.loadRequestId !== action.meta.requestId) {
          return;
        }
        state.loadRequestId = null;
        state.loadStatus = 'failed';
        state.loadError =
          action.error.message ?? 'No se pudo consultar la gestión de personal.';
      })
      .addCase(createMember.pending, (state) => {
        state.actionStatus = 'loading';
        state.actionError = null;
      })
      .addCase(createMember.fulfilled, (state) => {
        state.actionStatus = 'succeeded';
        state.actionError = null;
      })
      .addCase(createMember.rejected, (state, action) => {
        state.actionStatus = 'failed';
        state.actionError =
          action.error.message ?? 'No se pudo enviar la invitación.';
      })
      .addCase(updateAssignments.pending, (state) => {
        state.actionStatus = 'loading';
        state.actionError = null;
      })
      .addCase(updateAssignments.fulfilled, (state) => {
        state.actionStatus = 'succeeded';
        state.actionError = null;
      })
      .addCase(updateAssignments.rejected, (state, action) => {
        state.actionStatus = 'failed';
        state.actionError =
          action.error.message ?? 'No se pudieron guardar las asignaciones.';
      });
  },
});

export const { clearPersonnelAction } = personnelSlice.actions;
export default personnelSlice.reducer;
