import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useDispatch } from 'react-redux';
import type { Session } from '@supabase/supabase-js';

import {
  authenticationFailed,
  clearAuthenticationError,
  passwordRecoveryFinished,
  passwordRecoveryStarted,
  sessionAuthenticated,
  sessionLoading,
  sessionUnauthenticated,
} from '@/features/auth/presentation/auth-slice';
import {
  getCurrentSession,
  loadCurrentProfile,
  processAuthCallback,
  sendPasswordRecovery,
  signIn as signInWithPassword,
  signOut as signOutUser,
  subscribeToAuthChanges,
  updatePassword as updateUserPassword,
} from '@/features/auth/infrastructure/auth-repository';
import { supabase } from '@/features/auth/infrastructure/supabase-client';
import type { AppDispatch } from '@/store/store';

type AuthActions = {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordRecovery: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  processRecoveryLink: (url: string) => Promise<void>;
  retryProfile: () => Promise<void>;
};

const AuthActionsContext = createContext<AuthActions | null>(null);

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}

function recoverySessionKey(session: Session): string {
  return `${session.user.id}:${session.expires_at}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const loadSequence = useRef(0);
  const processedRecoveryUrls = useRef(new Set<string>());
  const passwordRecoveryPending = useRef(false);
  const recoverySessionKeyRef = useRef<string | null>(null);
  const mounted = useRef(false);
  const hydrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingHydration = useCallback(() => {
    if (hydrationTimer.current !== null) {
      clearTimeout(hydrationTimer.current);
      hydrationTimer.current = null;
    }
  }, []);

  const hydrateSession = useCallback(
    (session: Session | null, recovery?: boolean) => {
      if (!mounted.current) {
        return;
      }

      const requestId = ++loadSequence.current;
      cancelPendingHydration();
      if (!session) {
        dispatch(sessionUnauthenticated());
        return;
      }

      dispatch(sessionLoading({ userId: session.user.id, passwordRecovery: recovery }));
      hydrationTimer.current = setTimeout(() => {
        hydrationTimer.current = null;
        if (!mounted.current || requestId !== loadSequence.current) {
          return;
        }

        void loadCurrentProfile(session.user.id)
          .then((profile) => {
            if (mounted.current && requestId === loadSequence.current) {
              dispatch(sessionAuthenticated(profile));
            }
          })
          .catch((error: unknown) => {
            if (mounted.current && requestId === loadSequence.current) {
              dispatch(
                authenticationFailed({
                  userId: session.user.id,
                  message: messageFrom(error),
                }),
              );
            }
          });
      }, 0);
    },
    [cancelPendingHydration, dispatch],
  );

  const markPasswordRecoveryPending = useCallback(() => {
    if (passwordRecoveryPending.current) {
      return;
    }
    passwordRecoveryPending.current = true;
    recoverySessionKeyRef.current = null;
    loadSequence.current += 1;
    cancelPendingHydration();
    dispatch(passwordRecoveryStarted());
  }, [cancelPendingHydration, dispatch]);

  useEffect(() => {
    mounted.current = true;
    const subscription = subscribeToAuthChanges((event, session) => {
      if (!mounted.current) {
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryPending();
        if (!session) {
          dispatch(
            authenticationFailed({
              message: 'No se recibió una sesión válida para recuperar la contraseña.',
            }),
          );
          return;
        }

        const key = recoverySessionKey(session);
        if (key === recoverySessionKeyRef.current) {
          return;
        }
        recoverySessionKeyRef.current = key;
        hydrateSession(session, true);
        return;
      }

      if (event === 'INITIAL_SESSION' && passwordRecoveryPending.current) {
        return;
      }

      if (event === 'SIGNED_IN' && passwordRecoveryPending.current) {
        if (!session) {
          return;
        }

        const key = recoverySessionKey(session);
        if (key === recoverySessionKeyRef.current) {
          return;
        }
        recoverySessionKeyRef.current = key;
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        hydrateSession(session);
      } else if (event === 'SIGNED_OUT') {
        loadSequence.current += 1;
        cancelPendingHydration();
        passwordRecoveryPending.current = false;
        recoverySessionKeyRef.current = null;
        dispatch(sessionUnauthenticated());
      }
    });

    return () => {
      mounted.current = false;
      loadSequence.current += 1;
      cancelPendingHydration();
      subscription.unsubscribe();
    };
  }, [cancelPendingHydration, dispatch, hydrateSession, markPasswordRecoveryPending]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const runAuthAction = useCallback(
    async (operation: () => Promise<void>) => {
      dispatch(clearAuthenticationError());
      try {
        await operation();
      } catch (error) {
        dispatch(authenticationFailed({ message: messageFrom(error) }));
        throw error;
      }
    },
    [dispatch],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (passwordRecoveryPending.current) {
        passwordRecoveryPending.current = false;
        recoverySessionKeyRef.current = null;
        loadSequence.current += 1;
        cancelPendingHydration();
        dispatch(passwordRecoveryFinished());
      }
      await runAuthAction(() => signInWithPassword(email.trim(), password));
    },
    [cancelPendingHydration, dispatch, runAuthAction],
  );
  const signOut = useCallback(() => runAuthAction(signOutUser), [runAuthAction]);
  const requestPasswordRecovery = useCallback(
    (email: string) => runAuthAction(() => sendPasswordRecovery(email.trim())),
    [runAuthAction],
  );
  const updateUserPasswordWithValue = useCallback(
    async (password: string) => {
      await runAuthAction(() => updateUserPassword(password));
      passwordRecoveryPending.current = false;
      recoverySessionKeyRef.current = null;
      dispatch(passwordRecoveryFinished());
    },
    [dispatch, runAuthAction],
  );

  const processRecoveryLink = useCallback(
    async (url: string) => {
      if (!mounted.current || processedRecoveryUrls.current.has(url)) {
        return;
      }
      processedRecoveryUrls.current.add(url);
      passwordRecoveryPending.current = true;
      recoverySessionKeyRef.current = null;
      loadSequence.current += 1;
      cancelPendingHydration();
      dispatch(passwordRecoveryStarted());
      try {
        await processAuthCallback(url);
      } catch (error) {
        if (mounted.current) {
          dispatch(authenticationFailed({ message: messageFrom(error) }));
        }
      }
    },
    [cancelPendingHydration, dispatch],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Supabase exchanges browser callback URLs because detectSessionInUrl is enabled there.
      return;
    }

    const isRecoveryUrl = (url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'controlelectoral:') {
          return false;
        }

        const query = new URLSearchParams(parsed.search);
        const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const params = new URLSearchParams([...query.entries(), ...fragment.entries()]);
        return (
          parsed.hostname === 'reset-password' ||
          parsed.pathname.endsWith('/reset-password') ||
          params.get('type') === 'recovery' ||
          params.get('type') === 'invite' ||
          params.has('token_hash')
        );
      } catch {
        return false;
      }
    };

    const handleUrl = (url: string) => {
      if (isRecoveryUrl(url)) {
        void processRecoveryLink(url);
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    void Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl(url);
      }
    });

    return () => subscription.remove();
  }, [processRecoveryLink]);

  const retryProfile = useCallback(async () => {
    if (!mounted.current) {
      return;
    }
    dispatch(clearAuthenticationError());
    try {
      const session = await getCurrentSession();
      if (!mounted.current) {
        return;
      }
      if (!session) {
        dispatch(sessionUnauthenticated());
        return;
      }
      hydrateSession(session);
    } catch (error) {
      if (mounted.current) {
        dispatch(authenticationFailed({ message: messageFrom(error) }));
      }
      throw error;
    }
  }, [dispatch, hydrateSession]);

  const actions = useMemo(
    () => ({
      signIn,
      signOut,
      requestPasswordRecovery,
      updatePassword: updateUserPasswordWithValue,
      processRecoveryLink,
      retryProfile,
    }),
    [
      processRecoveryLink,
      requestPasswordRecovery,
      retryProfile,
      signIn,
      signOut,
      updateUserPasswordWithValue,
    ],
  );

  return <AuthActionsContext.Provider value={actions}>{children}</AuthActionsContext.Provider>;
}

export function useAuthActions(): AuthActions {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error('useAuthActions debe utilizarse dentro de AuthProvider.');
  }
  return context;
}

