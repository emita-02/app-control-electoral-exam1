import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  AuthHeading,
  AuthNotice,
  AuthShell,
  PrimaryButton,
} from '@/features/auth/presentation/components/auth-ui';
import {
  loadOfflineOperations,
  retryOfflineOperation,
  syncOfflineOperations,
} from '@/features/offline/presentation/offline-slice';
import type {
  OfflineOperationType,
  QueuedOperation,
} from '@/features/offline/domain/offline-queue';
import type { WorkspaceStackParamList } from '@/navigation/types';
import { useAppDispatch, useAppSelector } from '@/store/store';

const operationLabels: Record<OfflineOperationType, string> = {
  register_act: 'Registro de acta',
  upload_evidence: 'Carga de evidencia',
  process_ocr: 'Reconocimiento OCR',
  confirm_ocr: 'Confirmación de resultados',
  apply_correction: 'Corrección de acta',
  exit_poll: 'Respuesta del Exit Poll',
};

function OperationCard({
  operation,
  busy,
  onRetry,
}: {
  operation: QueuedOperation;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <View className="gap-2 rounded-xl border border-electoral-border bg-white p-4">
      <Text className="text-base font-bold text-electoral-navy">
        {operationLabels[operation.type]}
      </Text>
      <Text className="text-sm text-electoral-text">
        Referencia local: {operation.id} · Estado:{' '}
        {operation.status === 'pending' ? 'pendiente' : 'requiere revisión'}
      </Text>
      <Text className="text-sm text-electoral-muted">
        Intentos: {operation.attempts} · Creada:{' '}
        {new Date(operation.createdAt).toLocaleString('es-EC')}
      </Text>
      {operation.lastError ? (
        <Text className="text-sm leading-5 text-electoral-red">
          {operation.lastError}
        </Text>
      ) : null}
      {operation.status === 'failed' ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center"
          disabled={busy}
          onPress={onRetry}>
          <Text className="text-base font-semibold text-electoral-navy">
            Reintentar esta operación
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OfflineHistoryScreen({
  navigation,
}: NativeStackScreenProps<WorkspaceStackParamList, 'OfflineHistory'>) {
  const dispatch = useAppDispatch();
  const { operations, reviews, status, error, online, lastSyncAt } = useAppSelector(
    (state) => state.offline,
  );

  useEffect(() => {
    void dispatch(loadOfflineOperations());
  }, [dispatch]);

  return (
    <AuthShell>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center"
        onPress={() => navigation.goBack()}>
        <Text className="text-base font-semibold text-electoral-navy">Volver</Text>
      </Pressable>
      <AuthHeading
        title="Registros pendientes"
        description="Las operaciones creadas sin conexión se conservan en el dispositivo y se envían automáticamente al recuperar la conectividad."
      />

      <AuthNotice
        success={online}
        message={
          online
            ? 'Hay conexión disponible. Puedes sincronizar ahora.'
            : 'Sin conexión. Los registros se guardarán en este dispositivo.'
        }
      />
      {lastSyncAt ? (
        <Text className="text-sm text-electoral-muted">
          Última sincronización: {new Date(lastSyncAt).toLocaleString('es-EC')}
        </Text>
      ) : null}
      {error ? <AuthNotice message={error} /> : null}

      <PrimaryButton
        label="Sincronizar ahora"
        loading={status === 'loading'}
        disabled={!online || status === 'loading' || operations.length === 0}
        onPress={() => void dispatch(syncOfflineOperations())}
      />

      {operations.length === 0 ? (
        <AuthNotice success message="No hay operaciones pendientes." />
      ) : (
        <View className="gap-3">
          <Text className="text-lg font-bold text-electoral-navy">
            {operations.length} operación(es) guardadas
          </Text>
          {operations.map((operation) => (
            <OperationCard
              key={operation.id}
              operation={operation}
              busy={status === 'loading'}
              onRetry={() => void dispatch(retryOfflineOperation(operation.id))}
            />
          ))}
        </View>
      )}

      {reviews.length > 0 ? (
        <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5">
          <Text className="text-lg font-bold text-electoral-navy">
            Reconocimientos listos para revisión
          </Text>
          <Text className="text-sm leading-5 text-electoral-muted">
            Los valores del OCR son sugerencias. Revísalos y confírmalos
            manualmente antes de registrarlos como resultados.
          </Text>
          {reviews.map((review) => (
            <PrimaryButton
              key={review.key}
              label={`Revisar acta ${review.actId}`}
              disabled={!online}
              onPress={() =>
                navigation.navigate('ActOcrReview', {
                  actId: review.actId,
                  evidenceId: review.evidenceId,
                  reviewKey: review.key,
                })
              }
            />
          ))}
        </View>
      ) : null}
    </AuthShell>
  );
}
