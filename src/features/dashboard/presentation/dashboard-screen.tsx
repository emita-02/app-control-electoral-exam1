import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  AuthHeading,
  AuthNotice,
  AuthShell,
  LoadingScreen,
  PrimaryButton,
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
      className={`min-h-11 justify-center rounded-xl border px-3 ${
        selected
          ? 'border-electoral-cyan bg-electoral-cyan-light'
          : 'border-electoral-border bg-white'
      }`}
      onPress={onPress}>
      <Text className="text-sm font-semibold text-electoral-navy">{label}</Text>
    </Pressable>
  );
}

function SummaryCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5">
      <Text className="text-lg font-bold text-electoral-navy">Avance general</Text>
      <Text className="text-base text-electoral-text">
        Mesas con acta: {snapshot.reportedTables} de {snapshot.totalTables}
      </Text>
      <Text className="text-base text-electoral-text">
        Actas aprobadas: {snapshot.approvedActs} · Pendientes: {snapshot.pendingActs}
      </Text>
      <Text className="text-base text-electoral-text">
        Evidencias: {snapshot.evidenceCount} · Correcciones: {snapshot.correctionsCount}
      </Text>
    </View>
  );
}

function CandidateList({ candidates }: { candidates: DashboardCandidateResult[] }) {
  if (candidates.length === 0) {
    return (
      <Text className="text-sm text-electoral-muted">
        Todavía no hay resultados aprobados para esta dignidad.
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {candidates.map((candidate) => (
        <View key={candidate.candidateId} className="gap-1">
          <Text className="text-sm font-semibold text-electoral-navy">
            {candidate.candidateName} · {candidate.votes} votos ({candidate.percentage}%)
          </Text>
          <Text className="text-xs text-electoral-muted">{candidate.organization}</Text>
        </View>
      ))}
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
    <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5">
      <Text className="text-lg font-bold text-electoral-navy">Registrar Exit Poll</Text>
      <Text className="text-sm leading-5 text-electoral-muted">
        Las respuestas son independientes de los resultados oficiales y se asocian a la mesa seleccionada.
      </Text>

      <Text className="text-sm font-bold text-electoral-navy">Mesa</Text>
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

      <Text className="text-sm font-bold text-electoral-navy">Dignidad</Text>
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

      <Text className="text-sm font-bold text-electoral-navy">Respuesta</Text>
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

      {responseType === 'candidate' ? (
        <View className="gap-2">
          <Text className="text-sm font-bold text-electoral-navy">Candidatura</Text>
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
    <AuthShell>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center"
        onPress={() => navigation.goBack()}>
        <Text className="text-base font-semibold text-electoral-navy">Volver</Text>
      </Pressable>
      <AuthHeading
        title="Panel de resultados"
        description="Información disponible según tu rol y jurisdicción. Los datos electorales oficiales requieren revisión humana."
      />

      {status === 'failed' ? (
        <>
          <AuthNotice message={error ?? 'No se pudo cargar el panel.'} />
          <PrimaryButton
            label="Reintentar"
            onPress={() => {
              dispatch(clearDashboardError());
              void dispatch(loadDashboard());
            }}
          />
        </>
      ) : null}

      {snapshot ? (
        <>
          <SummaryCard snapshot={snapshot} />

          <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5">
            <Text className="text-lg font-bold text-electoral-navy">
              Seguimiento por recinto
            </Text>
            {snapshot.pollingPlaces.map((place) => (
              <View key={place.pollingPlaceId} className="gap-1">
                <Text className="text-sm font-semibold text-electoral-navy">
                  {place.pollingPlaceName}
                </Text>
                <Text className="text-sm text-electoral-muted">
                  Mesas reportadas: {place.reportedTables} de {place.totalTables} · Actas: {place.reportedActs}
                </Text>
              </View>
            ))}
          </View>

          {snapshot.positions.map((position) => {
            const exitPoll = exitPollByPosition.get(position.positionId);
            return (
              <View
                key={position.positionId}
                className="gap-4 rounded-2xl border border-electoral-border bg-white p-5">
                <View>
                  <Text className="text-lg font-bold text-electoral-navy">
                    {position.positionName}
                  </Text>
                  <Text className="text-sm text-electoral-muted">
                    Actas: {position.reportedActs} · Total: {position.totalVotes} · Blancos:{' '}
                    {position.blankVotes} · Nulos: {position.nullVotes}
                  </Text>
                </View>
                <CandidateList candidates={position.candidates} />
                {exitPoll ? (
                  <View className="gap-1">
                    <Text className="text-sm font-bold text-electoral-navy">
                      Exit Poll: {exitPoll.totalResponses} respuesta(s)
                    </Text>
                    <Text className="text-xs text-electoral-muted">
                      Blanco: {exitPoll.blankResponses} · Nulo: {exitPoll.nullResponses} · Sin respuesta: {exitPoll.noResponses}
                    </Text>
                    <CandidateList candidates={exitPoll.candidateResponses} />
                  </View>
                ) : null}
              </View>
            );
          })}

          <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5">
            <Text className="text-lg font-bold text-electoral-navy">
              Actas recientes
            </Text>
            {snapshot.recentActs.length === 0 ? (
              <Text className="text-sm text-electoral-muted">
                Todavía no hay actas registradas en tu jurisdicción.
              </Text>
            ) : (
              snapshot.recentActs.map((act) => (
                <View key={act.actId} className="gap-1">
                  <Text className="text-sm font-semibold text-electoral-navy">
                    Mesa {act.tableNumber} · {act.positionName}
                  </Text>
                  <Text className="text-xs text-electoral-muted">
                    {act.pollingPlaceName} · Estado: {act.status} · Evidencias: {act.evidenceCount}
                  </Text>
                  {(profile?.role === userRoles.observer ||
                    profile?.role === userRoles.precinctCoordinator) &&
                  act.actId > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-11 justify-center"
                      onPress={() =>
                        navigation.navigate('ActCorrection', { actId: act.actId })
                      }>
                      <Text className="text-sm font-semibold text-electoral-navy">
                        Corregir acta
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </View>

          {snapshot.locationWarnings.length > 0 ? (
            <View className="gap-2 rounded-xl border border-electoral-red bg-white p-4">
              <Text className="text-sm font-bold text-electoral-navy">
                Advertencias de ubicación
              </Text>
              {snapshot.locationWarnings.map((warning) => (
                <Text key={warning.actId} className="text-sm leading-5 text-electoral-red">
                  Acta {warning.actId}, mesa {warning.tableNumber}: evidencia a{' '}
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
    </AuthShell>
  );
}
