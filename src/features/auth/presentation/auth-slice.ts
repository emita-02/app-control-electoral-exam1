import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { UserProfile } from '@/features/auth/domain/user-profile';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'error';

type AuthState = {
  status: AuthStatus;
  userId: string | null;
  profile: UserProfile | null;
  error: string | null;
  passwordRecovery: boolean;
};

const initialState: AuthState = {
  status: 'loading',
  userId: null,
  profile: null,
  error: null,
  passwordRecovery: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionLoading(state, action: PayloadAction<{ userId: string; passwordRecovery?: boolean }>) {
      state.status = 'loading';
      state.userId = action.payload.userId;
      state.profile = null;
      state.error = null;
      state.passwordRecovery = action.payload.passwordRecovery ?? state.passwordRecovery;
    },
    sessionAuthenticated(state, action: PayloadAction<UserProfile>) {
      state.status = 'authenticated';
      state.userId = action.payload.id;
      state.profile = action.payload;
      state.error = null;
    },
    sessionUnauthenticated(state) {
      state.status = 'unauthenticated';
      state.userId = null;
      state.profile = null;
      state.error = null;
      state.passwordRecovery = false;
    },
    authenticationFailed(state, action: PayloadAction<{ userId?: string | null; message: string }>) {
      state.status = 'error';
      if (action.payload.userId !== undefined) {
        state.userId = action.payload.userId;
      }
      state.profile = null;
      state.error = action.payload.message;
    },
    clearAuthenticationError(state) {
      state.error = null;
      if (state.status === 'error' && !state.userId) {
        state.status = 'unauthenticated';
      }
    },
    passwordRecoveryStarted(state) {
      state.status = 'loading';
      state.userId = null;
      state.profile = null;
      state.passwordRecovery = true;
      state.error = null;
    },
    passwordRecoveryFinished(state) {
      state.passwordRecovery = false;
      state.error = null;
    },
  },
});

export const {
  authenticationFailed,
  clearAuthenticationError,
  passwordRecoveryFinished,
  passwordRecoveryStarted,
  sessionAuthenticated,
  sessionLoading,
  sessionUnauthenticated,
} = authSlice.actions;

export default authSlice.reducer;
