import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import {
  AppShell,
  AuthNotice,
  PrimaryButton,
  RoleHeader,
  StatusBadge,
} from "@/features/auth/presentation/components/auth-ui";
import { LottieAnimation } from "@/features/auth/presentation/components/lottie-animation";
import type {
  OfflineOperationType,
  QueuedOperation,
} from "@/features/offline/domain/offline-queue";
import {
  loadOfflineOperations,
  retryOfflineOperation,
  syncOfflineOperations,
} from "@/features/offline/presentation/offline-slice";
import type { WorkspaceStackParamList } from "@/navigation/types";
import { useAppDispatch, useAppSelector } from "@/store/store";

const operationLabels: Record<OfflineOperationType, string> = {
  register_act: "Registro de acta",
  upload_evidence: "Carga de evidencia",
  process_ocr: "Reconocimiento OCR",
  confirm_ocr: "Confirmación de resultados",
  apply_correction: "Corrección de acta",
  exit_poll: "Respuesta del Exit Poll",
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
  const isPending = operation.status === "pending";

  return (
    <View className="gap-2.5 rounded-2xl border border-electoral-border bg-white p-4 shadow-xs">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-base font-extrabold text-electoral-navy">
          {operationLabels[operation.type]}
        </Text>
        <StatusBadge
          label={isPending ? "Pendiente" : "Requiere revisión"}
          tone={isPending ? "cyan" : "red"}
        />
      </View>

      <Text className="text-xs font-medium text-electoral-muted">
        Ref. local #{operation.id} · Intentos: {operation.attempts} ·{" "}
        {new Date(operation.createdAt).toLocaleString("es-EC")}
      </Text>

      {operation.lastError ? (
        <View className="rounded-xl bg-red-50 p-3">
          <Text className="text-xs font-medium leading-4 text-electoral-red">
            {operation.lastError}
          </Text>
        </View>
      ) : null}

      {operation.status === "failed" ? (
        <Pressable
          accessibilityRole="button"
          className="mt-1 min-h-11 items-center justify-center rounded-xl border border-electoral-navy bg-white px-4 active:opacity-75"
          disabled={busy}
          onPress={onRetry}
        >
          <Text className="text-sm font-extrabold text-electoral-navy">
            Reintentar esta operación
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OfflineHistoryScreen({
  navigation,
}: NativeStackScreenProps<WorkspaceStackParamList, "OfflineHistory">) {
  const dispatch = useAppDispatch();
  const { operations, reviews, status, error, online, lastSyncAt } =
    useAppSelector((state) => state.offline);

  useEffect(() => {
    void dispatch(loadOfflineOperations());
  }, [dispatch]);

  return (
    <AppShell
      header={
        <RoleHeader
          badge={online ? "En línea" : "Modo Offline"}
          title="Registros pendientes"
          subtitle="Cola local protegida en SQLite y sincronización automática."
          onBack={() => navigation.goBack()}
        />
      }
    >
      <AuthNotice
        success={online}
        message={
          online
            ? "Conexión estable disponible. Puedes sincronizar tus registros pendientes ahora."
            : "Sin conexión a internet. Todos tus registros se conservan seguros en este dispositivo."
        }
      />

      {lastSyncAt ? (
        <Text className="px-1 text-xs font-semibold text-electoral-muted">
          Última sincronización: {new Date(lastSyncAt).toLocaleString("es-EC")}
        </Text>
      ) : null}
      {error ? <AuthNotice message={error} /> : null}
      {status === "loading" ? (
        <View className="items-center justify-center rounded-2xl border border-electoral-border bg-white p-4">
          <LottieAnimation
            loop
            size={84}
            source={require("../../../../assets/lottie/offline-sync.json")}
          />
          <Text className="mt-1 text-xs font-semibold text-electoral-navy">
            Sincronizando registros con el servidor…
          </Text>
        </View>
      ) : null}
      <PrimaryButton
        label="Sincronizar ahora"
        loading={status === "loading"}
        disabled={!online || status === "loading" || operations.length === 0}
        onPress={() => void dispatch(syncOfflineOperations())}
      />

      {operations.length === 0 ? (
        <View className="items-center gap-2 rounded-2xl border border-electoral-border bg-white p-6">
          <StatusBadge label="Todo al día" tone="cyan" />
          <LottieAnimation
            loop={false}
            size={84}
            source={require("../../../../assets/lottie/success-check.json")}
          />
          <Text className="mt-1 text-center text-base font-bold text-electoral-navy">
            No hay operaciones pendientes
          </Text>
          <Text className="text-center text-sm text-electoral-muted">
            Toda la información capturada ya está sincronizada con el servidor.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          <Text className="px-1 text-base font-extrabold text-electoral-navy">
            {operations.length} operación(es) en cola
          </Text>
          {operations.map((operation) => (
            <OperationCard
              key={operation.id}
              operation={operation}
              busy={status === "loading"}
              onRetry={() => void dispatch(retryOfflineOperation(operation.id))}
            />
          ))}
        </View>
      )}

      {reviews.length > 0 ? (
        <View className="gap-3 rounded-2xl border-2 border-electoral-cyan/40 bg-white p-5 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-extrabold text-electoral-navy">
              OCR listo para revisión
            </Text>
            <StatusBadge label={`${reviews.length} acta(s)`} tone="cyan" />
          </View>
          <Text className="text-sm leading-5 text-electoral-muted">
            Los valores extraídos por IA son sugerencias. Revísalos y
            confírmalos manualmente antes de registrarlos.
          </Text>
          {reviews.map((review) => (
            <PrimaryButton
              key={review.key}
              label={`Revisar acta #${review.actId} →`}
              variant="navy"
              disabled={!online}
              onPress={() =>
                navigation.navigate("ActOcrReview", {
                  actId: review.actId,
                  evidenceId: review.evidenceId,
                  reviewKey: review.key,
                })
              }
            />
          ))}
        </View>
      ) : null}
    </AppShell>
  );
}
