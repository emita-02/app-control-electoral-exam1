import { Pressable, Text, View } from 'react-native';

import {
  roleLabels,
  userRoles,
  type UserRole,
} from '@/features/auth/domain/user-profile';
import { useAuthActions } from '@/features/auth/presentation/auth-context';
import {
  AppShell,
  AuthBrand,
  AuthNotice,
  AuthShell,
  LoadingScreen,
  PrimaryButton,
  RoleHeader,
  StatusBadge,
} from '@/features/auth/presentation/components/auth-ui';
import { useAppSelector } from '@/store/store';

function ActionCard({
  tag,
  title,
  description,
  accent = 'cyan',
  onPress,
}: {
  tag: string;
  title: string;
  description: string;
  accent?: 'cyan' | 'navy' | 'red';
  onPress: () => void;
}) {
  const borderClass = {
    cyan: 'border-l-electoral-cyan',
    navy: 'border-l-electoral-navy',
    red: 'border-l-electoral-red',
  }[accent];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-2xl border border-l-4 border-electoral-border ${borderClass} bg-white p-4 shadow-xs active:scale-[0.99] active:bg-electoral-cyan-light/40`}>
      <View className="flex-row items-center justify-between">
        <StatusBadge
          label={tag}
          tone={accent === 'red' ? 'red' : accent === 'navy' ? 'navy' : 'cyan'}
        />
        <Text className="text-lg font-extrabold text-electoral-cyan">→</Text>
      </View>
      <Text className="mt-2.5 text-lg font-extrabold text-electoral-navy">{title}</Text>
      <Text className="mt-1 text-sm leading-5 text-electoral-muted">{description}</Text>
    </Pressable>
  );
}

export function RoleHome({
  role,
  onOpenTerritory,
  onOpenPersonnel,
  onOpenEvidence,
  onOpenActRegistration,
  onOpenDashboard,
  onOpenOfflineHistory,
}: {
  role: UserRole;
  onOpenTerritory?: () => void;
  onOpenPersonnel?: () => void;
  onOpenEvidence?: () => void;
  onOpenActRegistration?: () => void;
  onOpenDashboard?: () => void;
  onOpenOfflineHistory?: () => void;
}) {
  const { signOut } = useAuthActions();
  const { error, profile } = useAppSelector((state) => state.auth);
  const offlineCount = useAppSelector((state) => state.offline.operations.length);

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
          variant="danger"
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
    <AppShell
      header={
        <RoleHeader
          badge={roleLabels[role]}
          title={`Hola, ${profile.fullName}`}
          subtitle="Jornada Electoral · Control y Escrutinio"
        />
      }>
      {/* Tarjeta de Jurisdicción */}
      <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-electoral-muted">
            Jurisdicción asignada
          </Text>
          <StatusBadge label="Sesión Activa" tone="cyan" />
        </View>
        {profile.provinceId !== null ? (
          <View className="flex-row flex-wrap gap-2">
            <View className="rounded-xl bg-electoral-background px-3.5 py-2">
              <Text className="text-xs text-electoral-muted">Provincia ID</Text>
              <Text selectable className="text-base font-extrabold text-electoral-navy">
                #{profile.provinceId}
              </Text>
            </View>
            {profile.pollingPlaceId !== null ? (
              <View className="rounded-xl bg-electoral-background px-3.5 py-2">
                <Text className="text-xs text-electoral-muted">Recinto ID</Text>
                <Text selectable className="text-base font-extrabold text-electoral-navy">
                  #{profile.pollingPlaceId}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text className="text-sm leading-5 text-electoral-muted">
            No hay una provincia asignada al perfil.
          </Text>
        )}
      </View>

      {/* Acciones principales según el rol */}
      <View className="gap-3">
        <Text className="px-1 text-xs font-extrabold uppercase tracking-wider text-electoral-muted">
          Módulos operativos
        </Text>

        {role === userRoles.observer && onOpenActRegistration ? (
          <ActionCard
            tag="Escrutinio"
            title="Registrar acta electoral"
            description="Ingresa votos de Alcaldía o Prefectura con validación aritmética inmediata."
            accent="cyan"
            onPress={onOpenActRegistration}
          />
        ) : null}

        {role === userRoles.observer && onOpenEvidence ? (
          <ActionCard
            tag="Respaldo"
            title="Capturar evidencia fotográfica"
            description="Toma fotografía nítida del acta con coordenadas GPS verificadas."
            accent="navy"
            onPress={onOpenEvidence}
          />
        ) : null}

        {role === userRoles.provincialCoordinator && onOpenTerritory ? (
          <ActionCard
            tag="Territorio"
            title="Consultar estructura territorial"
            description="Revisa cantones, parroquias, recintos y mesas electorales de tu jurisdicción."
            accent="navy"
            onPress={onOpenTerritory}
          />
        ) : null}

        {onOpenPersonnel ? (
          <ActionCard
            tag="Equipo"
            title={
              role === userRoles.provincialCoordinator
                ? 'Gestionar coordinadores de recinto'
                : 'Gestionar veedores y asignaciones'
            }
            description={
              role === userRoles.provincialCoordinator
                ? 'Habilita y administra un coordinador responsable por cada recinto.'
                : 'Asigna mesas a veedores o realiza reemplazos inmediatos en tu recinto.'
            }
            accent="cyan"
            onPress={onOpenPersonnel}
          />
        ) : null}

        {onOpenDashboard ? (
          <ActionCard
            tag="Resultados en Vivo"
            title="Consultar panel y Exit Poll"
            description="Visualiza avance de mesas, resultados acumulados, evidencias y correcciones."
            accent="navy"
            onPress={onOpenDashboard}
          />
        ) : null}

        {onOpenOfflineHistory ? (
          <ActionCard
            tag={offlineCount > 0 ? `${offlineCount} pendiente(s)` : 'Sin conexión'}
            title="Registros pendientes de sincronización"
            description="Administra actas y evidencias guardadas localmente en el dispositivo."
            accent={offlineCount > 0 ? 'red' : 'cyan'}
            onPress={onOpenOfflineHistory}
          />
        ) : null}
      </View>

      {error ? <AuthNotice message={error} /> : null}

      <View className="pt-2">
        <PrimaryButton label="Cerrar sesión" variant="danger" onPress={onSignOut} />
      </View>
    </AppShell>
  );
}