import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';

import { userRoles, type UserProfile, type UserRole } from '@/features/auth/domain/user-profile';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

const roleCodes: Record<string, UserRole> = {
  coordinador_provincial: userRoles.provincialCoordinator,
  coordinador_recinto: userRoles.precinctCoordinator,
  veedor: userRoles.observer,
};

export function subscribeToAuthChanges(listener: AuthListener): Subscription {
  return supabase.auth.onAuthStateChange(listener).data.subscription;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error('No se pudo recuperar la sesión. Inténtalo nuevamente.');
  }
  return data.session;
}

export async function loadCurrentProfile(userId: string): Promise<UserProfile> {
  const { data: active, error: activeError } = await supabase.rpc('is_active_user');
  if (activeError || active !== true) {
    throw new Error('La cuenta está inactiva o no se pudo validar su estado.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role_id, province_id, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.id !== userId ||
    profile.is_active !== true ||
    typeof profile.full_name !== 'string' ||
    typeof profile.role_id !== 'number' ||
    !Number.isSafeInteger(profile.role_id) ||
    (profile.province_id !== null &&
      (typeof profile.province_id !== 'number' || !Number.isSafeInteger(profile.province_id)))
  ) {
    throw new Error('No se pudo validar el perfil activo de esta cuenta.');
  }

  const { data: roleCode, error: roleError } = await supabase.rpc('get_my_role');
  if (roleError || typeof roleCode !== 'string') {
    throw new Error('No se pudo validar el rol de esta cuenta.');
  }

  const role = roleCodes[roleCode.trim().toLowerCase()];
  if (!role) {
    throw new Error('La cuenta no tiene un rol habilitado para la aplicación.');
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    roleId: profile.role_id,
    role,
    provinceId: profile.province_id,
  };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error('No se pudo iniciar sesión. Revisa el correo y la contraseña.');
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    throw new Error('No se pudo cerrar la sesión. Inténtalo nuevamente.');
  }
}

export async function sendPasswordRecovery(email: string): Promise<void> {
  const redirectTo =
    Platform.OS === 'web'
      ? Linking.createURL('reset-password')
      : 'controlelectoral://reset-password';
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    throw new Error('No se pudo enviar el correo de recuperación. Inténtalo nuevamente.');
  }
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw new Error('No se pudo actualizar la contraseña. Solicita un nuevo enlace e inténtalo otra vez.');
  }
}

export async function processAuthCallback(url: string): Promise<void> {
  let callbackUrl: URL;
  try {
    callbackUrl = new URL(url);
  } catch {
    throw new Error('El enlace de recuperación no es válido.');
  }

  const query = new URLSearchParams(callbackUrl.search);
  const fragment = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
  const params = new URLSearchParams([...query.entries(), ...fragment.entries()]);
  const callbackError = params.get('error_description') ?? params.get('error');

  if (callbackError) {
    throw new Error('El enlace de recuperación expiró o no es válido.');
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) {
      throw new Error('El enlace de recuperación expiró o no es válido.');
    }
    return;
  }

  const tokenHash = params.get('token_hash');
  if (tokenHash && params.get('type') === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error) {
      throw new Error('El enlace de recuperación expiró o no es válido.');
    }
    return;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken && params.get('type') === 'recovery') {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw new Error('El enlace de recuperación expiró o no es válido.');
    }
    return;
  }

  throw new Error('El enlace no contiene una sesión de recuperación válida.');
}
