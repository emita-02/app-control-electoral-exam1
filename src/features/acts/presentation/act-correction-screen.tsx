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
import { proposalToConfirmationInput } from '@/features/acts/application/confirm-correction';
import {
  clearActConfirmation,
  confirmActResults,
} from '@/features/acts/presentation/act-confirmation-slice';
import {
  clearActCorrection,
  loadActCorrection,
} from '@/features/acts/presentation/act-correction-slice';
import { ActCorrectionForm } from '@/features/acts/presentation/components/act-correction-form';
import type { ActCorrectionProposal } from '@/features/acts/domain/electoral-act';
import type { WorkspaceStackParamList } from '@/navigation/types';
import { useAppDispatch, useAppSelector } from '@/store/store';

function formatHistoryData(data: Record<string, unknown>): string {
  const votes = data.candidateVotes;
  if (!Array.isArray(votes)) {
    return JSON.stringify(data);
  }
  const candidates = votes
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }
      const record = item as Record<string, unknown>;
      return `${record.candidateId ?? '?'}: ${record.votes ?? '?'}`;
    })
    .filter((item): item is string => item !== null);
  return `Candidaturas: ${candidates.join(', ')} · Blancos: ${String(data.blankVotes ?? '?')} · Nulos: ${String(data.nullVotes ?? '?')} · Total: ${String(data.totalVotes ?? '?')}`;
}

export function ActCorrectionScreen({
  navigation,
  route,
}: NativeStackScreenProps<WorkspaceStackParamList, 'ActCorrection'>) {
  const dispatch = useAppDispatch();
  const { actId } = route.params;
  const [proposalState, setProposalState] = useState<{
    actId: number;
    proposal: ActCorrectionProposal;
  } | null>(null);
  const pendingProposal =
    proposalState?.actId === actId ? proposalState.proposal : null;
  const { context, status, error } = useAppSelector((state) => state.actCorrection);
  const confirmation = useAppSelector((state) => state.actConfirmation);

  useEffect(() => {
    dispatch(clearActConfirmation());
    dispatch(clearActCorrection());
    const request = dispatch(loadActCorrection(actId));
    return () => {
      request.abort();
      dispatch(clearActConfirmation());
      dispatch(clearActCorrection());
    };
  }, [actId, dispatch]);

  if (status === 'idle' || status === 'loading') {
    return <LoadingScreen message="Cargando el acta y su historial…" />;
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
        title="Corrección de acta"
        description={`Acta ${actId}. Las correcciones requieren motivo y conservan el historial de cambios.`}
      />

      {status === 'failed' ? (
        <>
          <AuthNotice message={error ?? 'No se pudo cargar el acta.'} />
          <PrimaryButton
            label="Reintentar"
            onPress={() => void dispatch(loadActCorrection(actId))}
          />
        </>
      ) : null}

      {context ? (
        <>
          <ActCorrectionForm
            act={context.act}
            assignedTableIds={context.assignedTableIds}
            onCorrectionPrepared={(proposal: ActCorrectionProposal) => {
              dispatch(clearActConfirmation());
              setProposalState({ actId, proposal });
            }}
          />

          {pendingProposal ? (
            <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5">
              <Text className="text-base font-bold text-electoral-navy">
                Autorización de la corrección
              </Text>
              <Text className="text-sm leading-5 text-electoral-text">
                Revisa los valores propuestos. Al confirmar, la corrección se
                guardará en el historial y se registrará como resultado oficial
                de esta acta. Esta revisión humana es obligatoria.
              </Text>
              <PrimaryButton
                label="Confirmar y aplicar corrección"
                loading={confirmation.status === 'loading'}
                disabled={confirmation.status === 'loading'}
                onPress={() => {
                  void dispatch(
                    confirmActResults(
                      proposalToConfirmationInput(pendingProposal, actId),
                    ),
                  )
                    .unwrap()
                    .then(() => {
                      setProposalState(null);
                      void dispatch(loadActCorrection(actId));
                    })
                    .catch(() => {
                      // El error se muestra desde `state.actConfirmation`.
                    });
                }}
              />
            </View>
          ) : null}

          {confirmation.status === 'loading' ? (
            <AuthNotice message="Guardando la corrección…" />
          ) : null}
          {confirmation.status === 'failed' ? (
            <AuthNotice message={confirmation.error ?? 'No se pudo guardar la corrección.'} />
          ) : null}
          {confirmation.status === 'succeeded' ? (
            <AuthNotice
              success
              message={
                confirmation.savedOffline
                  ? 'La corrección quedó pendiente de sincronización.'
                  : confirmation.result?.correctionRegistered
                    ? 'Corrección guardada y registrada en el historial.'
                    : 'El acta fue confirmada sin cambios en los valores.'
              }
            />
          ) : null}

          <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5">
            <Text className="text-lg font-bold text-electoral-navy">
              Historial de correcciones
            </Text>
            {context.records.length === 0 ? (
              <Text className="text-sm text-electoral-muted">
                Esta acta no tiene correcciones registradas.
              </Text>
            ) : (
              context.records.map((record) => (
                <View key={record.id} className="gap-1">
                  <Text className="text-sm font-semibold text-electoral-navy">
                    {new Date(record.correctedAt).toLocaleString('es-EC')}
                  </Text>
                  <Text className="text-xs text-electoral-muted">
                    Responsable: {record.correctedBy}
                  </Text>
                  <Text className="text-xs text-electoral-text">
                    Anterior: {formatHistoryData(record.previousData)}
                  </Text>
                  <Text className="text-xs text-electoral-text">
                    Corregido: {formatHistoryData(record.correctedData)}
                  </Text>
                  <Text className="text-xs text-electoral-red">Motivo: {record.reason}</Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </AuthShell>
  );
}
