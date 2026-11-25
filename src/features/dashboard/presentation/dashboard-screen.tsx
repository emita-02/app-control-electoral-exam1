import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  AppShell,
  AuthNotice,
  LoadingScreen,
  PrimaryButton,
  RoleHeader,
  StatusBadge,
} from '@/features/auth/presentation/components/auth-ui';
import { userRoles } from '@/features/auth/domain/user-profile';
import type {
  DashboardCandidateResult,
  DashboardSnapshot,
} from '@/features/dashboard/domain/dashboard';
import type { ExitPollResponseType } from '@/features/dashboard/domain/exit-poll';
import {
  clearDashboardError,
  loadDashboard,
  registerExitPoll,
} from '@/features/dashboard/presentation/dashboard-slice';
import type { WorkspaceStackParamList } from '@/navigation/types';
import { useAppDispatch, useAppSelector } from '@/store/store';

const responseTypes: { value: ExitPollResponseType; label: string }[] = [
  { value: 'candidate', label: 'Candidatura' },
  { value: 'blank', label: 'Voto en blanco' },
  { value: 'null', label: 'Voto nulo' },
  { value: 'no_response', label: 'Sin respuesta' },
];

function Option({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`min-h-11 justify-center rounded-xl border-2 px-3.5 py-2 ${
        selected
          ? 'border-electoral-cyan bg-electoral-cyan-light'
          : 'border-electoral-border bg-white'
      }`}
      onPress={onPress}>
      <Text
        className={`text-sm ${
          selected ? 'font-extrabold text-electoral-navy' : 'font-semibold text-electoral-text'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const progressPct =
    snapshot.totalTables > 0
      ? Math.min(100, Math.round((snapshot.reportedTables / snapshot.totalTables) * 100))
      : 0;

  return (
    <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-extrabold text-electoral-navy">Avance general</Text>
        <StatusBadge label={`${progressPct}% escrutado`} tone="cyan" />
      </View>

      {/* Barra de progreso general */}
      <View className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <View
          className="h-full rounded-full bg-electoral-cyan"
          style={{ width: `${progressPct}%` }}
        />
      </View>

      <View className="flex-row flex-wrap gap-2.5">
        <View className="min-w-[46%] flex-1 rounded-xl bg-electoral-background p-3">
          <Text className="text-xs font-semibold text-electoral-muted">Mesas con acta</Text>
          <Text className="mt-0.5 text-xl font-extrabold text-electoral-navy">
            {snapshot.reportedTables}{' '}
            <Text className="text-sm font-normal text-electoral-muted">
              / {snapshot.totalTables}
            </Text>
          </Text>
        </View>

        <View className="min-w-[46%] flex-1 rounded-xl bg-electoral-cyan-light/70 p-3">
          <Text className="text-xs font-semibold text-electoral-navy">Actas aprobadas</Text>
          <Text className="mt-0.5 text-xl font-extrabold text-electoral-navy">
            {snapshot.approvedActs}
          </Text>
        </View>

        <View className="min-w-[46%] flex-1 rounded-xl bg-electoral-background p-3">
          <Text className="text-xs font-semibold text-electoral-muted">En revisión</Text>
          <Text className="mt-0.5 text-xl font-extrabold text-electoral-navy">
            {snapshot.pendingActs}
          </Text>
        </View>

        <View className="min-w-[46%] flex-1 rounded-xl bg-electoral-background p-3">
          <Text className="text-xs font-semibold text-electoral-muted">Evidencias / Corr.</Text>
          <Text className="mt-0.5 text-xl font-extrabold text-electoral-navy">
            {snapshot.evidenceCount}{' '}
            <Text className="text-sm font-normal text-electoral-muted">
              · {snapshot.correctionsCount}
            </Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

function CandidateList({ candidates }: { candidates: DashboardCandidateResult[] }) {
  if (candidates.length === 0) {
    return (
      <View className="rounded-xl bg-electoral-background p-3.5">
        <Text className="text-sm text-electoral-muted">
          Todavía no hay resultados aprobados para esta dignidad.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {candidates.map((candidate, index) => {
        const barWidth = Math.min(100, Math.max(2, candidate.percentage));
        const isLeader = index === 0 && candidate.votes > 0;

        return (
          <View
            key={candidate.candidateId}
            className={`gap-2 rounded-xl border p-3.5 ${
              isLeader
                ? 'border-electoral-cyan bg-electoral-cyan-light/40'
                : 'border-electoral-border bg-electoral-background/60'
            }`}>
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text className="text-sm font-extrabold text-electoral-navy">
                  {candidate.candidateName}
                </Text>
                <Text className="text-xs font-medium text-electoral-muted">
                  {candidate.organization}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-base font-extrabold text-electoral-navy">
                  {candidate.percentage}%
                </Text>
                <Text className="text-xs font-semibold text-electoral-muted">
                  {candidate.votes} votos
                </Text>
              </View>
            </View>

            <View className="h-2.5 w-full overflow-hidden rounded-full bg-white">
              <View
                className={`h-full rounded-full ${
                  isLeader ? 'bg-electoral-cyan' : 'bg-electoral-navy'
                }`}
                style={{ width: `${barWidth}%` }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ExitPollForm({ snapshot }: { snapshot: DashboardSnapshot }) {
  const dispatch = useAppDispatch();
  const { exitPollStatus, exitPollError, exitPollSavedOffline } = useAppSelector(
    (state) => state.dashboard,
  );
  const [tableId, setTableId] = useState<number | null>(null);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [responseType, setResponseType] =
    useState<ExitPollResponseType>('candidate');

  const selectedPosition = snapshot.positions.find(
    (position) => position.positionId === positionId,
  );

  const submit = async () => {
    if (tableId === null || positionId === null) {
      return;
    }
    try {
      await dispatch(
        registerExitPoll({
          electoralTableId: tableId,
          positionId,
          candidateId: responseType === 'candidate' ? candidateId : null,
          responseType,
        }),
      ).unwrap();
    } catch {
      // El mensaje se muestra desde el estado del slice.
    }
  };

  return (
    <View className="gap-4 rounded-2xl border-2 border-electoral-navy/15 bg-white p-5 shadow-xs">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-extrabold text-electoral-navy">Registrar Exit Poll</Text>
        <StatusBadge label="Boca de urna" tone="navy" />
      </View>
      <Text className="text-sm leading-5 text-electoral-muted">
        Las respuestas son independientes de los resultados oficiales y se asocian a la mesa seleccionada.
      </Text>

      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-wide text-electoral-navy">
          1. Selecciona la mesa
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {snapshot.tables.map((table) => (
            <Option
              key={table.id}
              label={`Mesa ${table.tableNumber}`}
              selected={tableId === table.id}
              onPress={() => setTableId(table.id)}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-wide text-electoral-navy">
          2. Dignidad
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {snapshot.positions.map((position) => (
            <Option
              key={position.positionId}
              label={position.positionName}
              selected={positionId === position.positionId}
              onPress={() => {
                setPositionId(position.positionId);
                setCandidateId(null);
              }}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-wide text-electoral-navy">
          3. Tipo de respuesta
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {responseTypes.map((type) => (
            <Option
              key={type.value}
              label={type.label}
              selected={responseType === type.value}
              onPress={() => setResponseType(type.value)}
            />
          ))}
        </View>
      </View>

      {responseType === 'candidate' ? (
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wide text-electoral-navy">
            4. Candidatura elegida
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(selectedPosition?.officialCandidates ?? []).map((candidate) => (
              <Option
                key={candidate.candidateId}
                label={candidate.candidateName}
                selected={candidateId === candidate.candidateId}
                onPress={() => setCandidateId(candidate.candidateId)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {exitPollError ? <AuthNotice message={exitPollError} /> : null}
      {exitPollSavedOffline ? (
        <AuthNotice
          success
          message="La respuesta quedó guardada en el dispositivo y se enviará al recuperar la conexión."
        />
      ) : null}
      {exitPollStatus === 'succeeded' && !exitPollSavedOffline ? (
        <AuthNotice success message="Respuesta del Exit Poll registrada." />
      ) : null}
      <PrimaryButton
        label="Guardar respuesta"
        variant="navy"
        loading={exitPollStatus === 'loading'}
        disabled={
          tableId === null ||
          positionId === null ||
          (responseType === 'candidate' && candidateId === null) ||
          exitPollStatus === 'loading'
        }
        onPress={() => void submit()}
      />
    </View>
  );
}

export function DashboardScreen({
  navigation,
}: NativeStackScreenProps<WorkspaceStackParamList, 'Dashboard'>) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.auth.profile);
  const { snapshot, status, error } = useAppSelector((state) => state.dashboard);
  const exitPollByPosition = new Map(
    (snapshot?.exitPolls ?? []).map((poll) => [poll.positionId, poll]),
  );

  useEffect(() => {
    void dispatch(loadDashboard());
  }, [dispatch]);

  if (status === 'loading' || (status === 'idle' && !snapshot)) {
    return <LoadingScreen message="Cargando el panel de resultados…" />;
  }

  return (
    <AppShell
      header={
        <RoleHeader
          badge="Monitoreo en Vivo"
          title="Panel de resultados"
          subtitle="Consolidado electoral y Exit Poll según tu jurisdicción."
          onBack={() => navigation.goBack()}
        />
      }>
      {status === 'failed' ? (
        <View className="gap-3">
          <AuthNotice message={error ?? 'No se pudo cargar el panel.'} />
          <PrimaryButton
            label="Reintentar"
            onPress={() => {
              dispatch(clearDashboardError());
              void dispatch(loadDashboard());
            }}
          />
        </View>
      ) : null}

      {snapshot ? (
        <>
          <SummaryCard snapshot={snapshot} />

          {/* Seguimiento por recinto */}
          <View className="gap-3.5 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
            <Text className="text-lg font-extrabold text-electoral-navy">
              Seguimiento por recinto
            </Text>
            {snapshot.pollingPlaces.map((place) => {
              const pct =
                place.totalTables > 0
                  ? Math.min(100, Math.round((place.reportedTables / place.totalTables) * 100))
                  : 0;
              return (
                <View
                  key={place.pollingPlaceId}
                  className="gap-2 rounded-xl border border-electoral-border bg-electoral-background/60 p-3.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-extrabold text-electoral-navy">
                      {place.pollingPlaceName}
                    </Text>
                    <Text className="text-xs font-extrabold text-electoral-cyan">{pct}%</Text>
                  </View>
                  <View className="h-2 w-full overflow-hidden rounded-full bg-white">
                    <View
                      className="h-full rounded-full bg-electoral-cyan"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                  <Text className="text-xs font-medium text-electoral-muted">
                    Mesas reportadas: {place.reportedTables} de {place.totalTables} · Actas:{' '}
                    {place.reportedActs}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Resultados por dignidad */}
          {snapshot.positions.map((position) => {
            const exitPoll = exitPollByPosition.get(position.positionId);
            return (
              <View
                key={position.positionId}
                className="gap-4 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
                <View className="gap-1 border-b border-electoral-border pb-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-lg font-extrabold text-electoral-navy">
                      {position.positionName}
                    </Text>
                    <StatusBadge label={`${position.reportedActs} actas`} tone="cyan" />
                  </View>
                  <Text className="text-xs font-semibold text-electoral-muted">
                    Total votos: {position.totalVotes} · Blancos: {position.blankVotes} · Nulos:{' '}
                    {position.nullVotes}
                  </Text>
                </View>

                <CandidateList candidates={position.candidates} />

                {exitPoll ? (
                  <View className="mt-1 gap-3 border-t border-dashed border-electoral-border pt-4">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-extrabold text-electoral-navy">
                        Tendencia Exit Poll
                      </Text>
                      <StatusBadge
                        label={`${exitPoll.totalResponses} muestra(s)`}
                        tone="neutral"
                      />
                    </View>
                    <Text className="text-xs text-electoral-muted">
                      Blanco: {exitPoll.blankResponses} · Nulo: {exitPoll.nullResponses} · Sin
                      respuesta: {exitPoll.noResponses}
                    </Text>
                    <CandidateList candidates={exitPoll.candidateResponses} />
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* Actas recientes */}
          <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
            <Text className="text-lg font-extrabold text-electoral-navy">Actas recientes</Text>
            {snapshot.recentActs.length === 0 ? (
              <Text className="text-sm text-electoral-muted">
                Todavía no hay actas registradas en tu jurisdicción.
              </Text>
            ) : (
              snapshot.recentActs.map((act) => (
                <View
                  key={act.actId}
                  className="gap-2 rounded-xl border border-electoral-border bg-electoral-background/60 p-3.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-sm font-extrabold text-electoral-navy">
                      Mesa {act.tableNumber} · {act.positionName}
                    </Text>
                    <StatusBadge label={act.status} tone="cyan" />
                  </View>
                  <Text className="text-xs text-electoral-muted">
                    {act.pollingPlaceName} · Evidencias: {act.evidenceCount}
                  </Text>
                  {act.latitude !== null && act.longitude !== null ? (
                    <Text className="text-xs font-medium text-electoral-navy">
                      GPS: {act.latitude.toFixed(5)}, {act.longitude.toFixed(5)}
                    </Text>
                  ) : null}
                  {(profile?.role === userRoles.observer ||
                    profile?.role === userRoles.precinctCoordinator) &&
                  act.actId > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      className="mt-1 min-h-10 items-center justify-center rounded-xl border border-electoral-navy bg-white px-3 active:opacity-75"
                      onPress={() =>
                        navigation.navigate('ActCorrection', { actId: act.actId })
                      }>
                      <Text className="text-xs font-extrabold text-electoral-navy">
                        Corregir acta →
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </View>

          {snapshot.locationWarnings.length > 0 ? (
            <View className="gap-2 rounded-2xl border-l-4 border-electoral-red bg-red-50 p-4">
              <Text className="text-sm font-extrabold text-electoral-red">
                Advertencias de ubicación GPS
              </Text>
              {snapshot.locationWarnings.map((warning) => (
                <Text key={warning.actId} className="text-sm leading-5 text-electoral-red">
                  • Acta #{warning.actId}, mesa {warning.tableNumber}: evidencia a{' '}
                  {warning.distanceMeters} m del centro estimado de la jurisdicción.
                </Text>
              ))}
            </View>
          ) : null}

          {profile?.role === userRoles.provincialCoordinator ||
          profile?.role === userRoles.precinctCoordinator ? (
            <ExitPollForm snapshot={snapshot} />
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}