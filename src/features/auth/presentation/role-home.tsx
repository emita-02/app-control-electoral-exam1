import { Text, View } from 'react-native';

import { roleLabels, type UserRole } from '@/features/auth/domain/user-profile';
import { useAuthActions } from '@/features/auth/presentation/auth-context';
import {
  AuthBrand,
  AuthNotice,
  AuthShell,
  LoadingScreen,
  PrimaryButton,
} from '@/features/auth/presentation/components/auth-ui';
import { useAppSelector } from '@/store/store';

export function RoleHome({ role }: { role: UserRole }) {
  const { signOut } = useAuthActions();
  const { error, profile } = useAppSelector((state) => state.auth);

  if (!profile) {
    return <LoadingScreen />;
  }
  if (profile.role !== role) {
    return (
      <AuthShell>
        <AuthBrand />
        <AuthNotice message="Tu cuenta no tiene acceso a este espacio de trabajo." />
        {error ? <AuthNotice message={error} /> : null}
        <PrimaryButton
          label="Cerrar sesión"
          onPress={() => {
            void signOut().catch(() => undefined);
          }}
        />
      </AuthShell>
    );
  }

  const onSignOut = () => {
    void signOut().catch(() => undefined);
  };

  return (
    <AuthShell>
      <AuthBrand />
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-wide text-electoral-muted">
          Espacio de trabajo
        </Text>
        <Text className="text-3xl font-bold text-electoral-navy">{roleLabels[role]}</Text>
        <Text className="text-base leading-6 text-electoral-muted">
          Sesión autenticada para {profile.fullName}.
        </Text>
      </View>

      <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5">
        <Text className="text-lg font-bold text-electoral-navy">Jurisdicción asignada</Text>
        {profile.provinceId !== null ? (
          <Text selectable className="text-base leading-6 text-electoral-text">
            Provincia: {profile.provinceId}
          </Text>
        ) : (
          <Text className="text-base leading-6 text-electoral-muted">
            No hay una provincia asignada al perfil.
          </Text>
        )}
        <Text className="text-sm leading-5 text-electoral-muted">
          El acceso a los datos depende de los permisos configurados en Supabase.
        </Text>
      </View>

      {error ? <AuthNotice message={error} /> : null}
      <PrimaryButton label="Cerrar sesión" onPress={onSignOut} />
    </AuthShell>
  );
}
