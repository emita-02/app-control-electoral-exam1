import { zodResolver } from "@hookform/resolvers/zod";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";

import {
  type ElectoralActFormInput,
  validateElectoralActForm,
} from "@/features/acts/domain/electoral-act";
import {
  clearActRegistrationError,
  clearSavedAct,
  loadActRegistrationCatalog,
  submitElectoralAct,
} from "@/features/acts/presentation/act-registration-slice";
import { ActValidationFeedback } from "@/features/acts/presentation/components/act-validation-feedback";
import { userRoles } from "@/features/auth/domain/user-profile";
import {
  AppShell,
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthShell,
  LoadingScreen,
  PrimaryButton,
  RoleHeader,
  StatusBadge,
} from "@/features/auth/presentation/components/auth-ui";
import { LottieAnimation } from "@/features/auth/presentation/components/lottie-animation";
import type { WorkspaceStackParamList } from "@/navigation/types";
import { useAppDispatch, useAppSelector } from "@/store/store";

const registrationSchema = z
  .object({
    electoralTableId: z.string(),
    positionId: z.string(),
    candidateVotes: z.array(z.string()),
    blankVotes: z.string(),
    nullVotes: z.string(),
    totalVotes: z.string(),
    observations: z.string(),
  })
  .superRefine((values, context) => {
    if (!values.electoralTableId) {
      context.addIssue({
        code: "custom",
        path: ["electoralTableId"],
        message: "Selecciona una mesa electoral.",
      });
    }
    if (!values.positionId) {
      context.addIssue({
        code: "custom",
        path: ["positionId"],
        message: "Selecciona una dignidad electoral.",
      });
    }
    for (const issue of validateElectoralActForm(toActFormInput(values))
      .issues) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  });

type RegistrationFormValues = z.input<typeof registrationSchema>;
type ScreenProps = NativeStackScreenProps<
  WorkspaceStackParamList,
  "ActRegistration"
>;

const emptyFormValues: RegistrationFormValues = {
  electoralTableId: "",
  positionId: "",
  candidateVotes: [],
  blankVotes: "",
  nullVotes: "",
  totalVotes: "",
  observations: "",
};

function toVote(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const vote = Number(normalized);
  return Number.isSafeInteger(vote) ? vote : null;
}

function toActFormInput(
  values: Pick<
    RegistrationFormValues,
    | "candidateVotes"
    | "blankVotes"
    | "nullVotes"
    | "totalVotes"
    | "observations"
  >,
): ElectoralActFormInput {
  return {
    candidateVotes: values.candidateVotes.map(toVote),
    blankVotes: toVote(values.blankVotes),
    nullVotes: toVote(values.nullVotes),
    totalVotes: toVote(values.totalVotes),
    observations: values.observations,
  };
}

function SelectableOption({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-row items-center justify-between rounded-2xl border-2 p-4 ${
        selected
          ? "border-electoral-cyan bg-electoral-cyan-light"
          : "border-electoral-border bg-white"
      }`}
      onPress={onPress}
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-extrabold text-electoral-navy">
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-xs leading-4 text-electoral-muted">
            {description}
          </Text>
        ) : null}
      </View>
      <View
        className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
          selected
            ? "border-electoral-cyan bg-electoral-cyan"
            : "border-electoral-border bg-white"
        }`}
      >
        {selected ? (
          <View className="h-2.5 w-2.5 rounded-full bg-white" />
        ) : null}
      </View>
    </Pressable>
  );
}

export function ActRegistrationScreen({ navigation }: ScreenProps) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.auth.profile);
  const {
    catalog,
    catalogStatus,
    catalogError,
    saveStatus,
    saveError,
    savedAct,
    savedOffline,
  } = useAppSelector((state) => state.actRegistration);
  const {
    control,
    formState: { errors },
    handleSubmit,
    reset,
    setValue,
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: emptyFormValues,
    mode: "onChange",
  });
  const watchedValues = useWatch({ control }) as RegistrationFormValues;
  const selectedPositionId = watchedValues.positionId ?? "";
  const selectedCandidates =
    catalog?.candidates.filter(
      (candidate) => String(candidate.positionId) === selectedPositionId,
    ) ?? [];
  const validation = validateElectoralActForm(toActFormInput(watchedValues));
  const isObserver = profile?.role === userRoles.observer;
  const watcherId = profile?.id ?? null;

  useEffect(() => {
    if (!isObserver || !watcherId) {
      return;
    }
    dispatch(clearSavedAct());
    const request = dispatch(loadActRegistrationCatalog(watcherId));
    return () => {
      request.abort();
    };
  }, [dispatch, isObserver, watcherId]);

  if (!profile) {
    return <LoadingScreen />;
  }

  if (!isObserver) {
    return (
      <AuthShell>
        <AuthHeading
          title="Registro de actas"
          description="Esta función está disponible únicamente para veedores electorales."
        />
        <AuthNotice message="Tu cuenta no tiene acceso al registro de actas." />
        <PrimaryButton label="Volver" onPress={() => navigation.goBack()} />
      </AuthShell>
    );
  }

  if (catalogStatus === "idle" || catalogStatus === "loading") {
    return (
      <LoadingScreen message="Cargando mesas, dignidades y candidaturas…" />
    );
  }

  if (catalogStatus === "failed") {
    return (
      <AuthShell>
        <AuthHeading
          title="Registro de actas"
          description="No fue posible preparar el formulario de registro."
        />
        <AuthNotice
          message={
            catalogError ??
            "No se pudo cargar la información necesaria para registrar actas."
          }
        />
        <PrimaryButton
          label="Reintentar"
          onPress={() => {
            dispatch(clearActRegistrationError());
            void dispatch(loadActRegistrationCatalog(profile.id));
          }}
        />
        <PrimaryButton
          label="Volver"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      </AuthShell>
    );
  }

  if (
    !catalog ||
    catalog.tables.length === 0 ||
    catalog.positions.length === 0 ||
    catalog.candidates.length === 0
  ) {
    return (
      <AuthShell>
        <AuthHeading
          title="Registro de actas"
          description="Faltan datos electorales para preparar el formulario."
        />
        <AuthNotice message="No hay mesas asignadas, dignidades o candidaturas disponibles para tu cuenta." />
        <PrimaryButton label="Volver" onPress={() => navigation.goBack()} />
      </AuthShell>
    );
  }

  const selectPosition = (positionId: string) => {
    const candidates = catalog.candidates.filter(
      (candidate) => String(candidate.positionId) === positionId,
    );
    setValue("positionId", positionId, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue(
      "candidateVotes",
      candidates.map(() => ""),
      { shouldValidate: true, shouldDirty: true },
    );
    if (saveStatus === "failed" || saveStatus === "succeeded") {
      dispatch(clearSavedAct());
    }
  };

  const submit = async (values: RegistrationFormValues) => {
    if (selectedCandidates.length !== values.candidateVotes.length) {
      return;
    }

    try {
      await dispatch(
        submitElectoralAct({
          electoralTableId: Number(values.electoralTableId),
          positionId: Number(values.positionId),
          candidateVotes: selectedCandidates.map((candidate, index) => ({
            candidateId: candidate.id,
            votes: toVote(values.candidateVotes[index]) ?? 0,
          })),
          blankVotes: toVote(values.blankVotes) ?? 0,
          nullVotes: toVote(values.nullVotes) ?? 0,
          totalVotes: toVote(values.totalVotes) ?? 0,
          observation: values.observations.trim() || null,
        }),
      ).unwrap();
    } catch {
      // El mensaje comprensible se muestra desde `state.actRegistration.saveError`.
    }
  };

  if (saveStatus === "succeeded" && savedAct) {
    return (
      <AppShell
        header={
          <RoleHeader
            badge="Acta Guardada"
            title="Registro completado"
            subtitle={`Mesa ${savedAct.electoralTableId} · Acta #${savedAct.id}`}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <LottieAnimation
          loop={false}
          size={92}
          source={require("../../../../assets/lottie/success-check.json")}
        />
        <AuthNotice
          success={!savedOffline}
          message={
            savedOffline
              ? `Acta ${savedAct.id} guardada localmente sin conexión. Puedes tomar la foto con GPS ahora; todo se sincronizará al recuperar señal.`
              : `Acta ${savedAct.id} registrada para la mesa ${savedAct.electoralTableId}. Estado: ${savedAct.status}.`
          }
        />
        <PrimaryButton
          label="Continuar con la evidencia fotográfica →"
          onPress={() =>
            navigation.navigate("EvidenceCapture", { actId: savedAct.id })
          }
        />
        {savedOffline ? (
          <PrimaryButton
            label="Ver registros pendientes"
            variant="navy"
            onPress={() => navigation.navigate("OfflineHistory")}
          />
        ) : null}
        <PrimaryButton
          label="Registrar otra acta"
          variant="secondary"
          onPress={() => {
            dispatch(clearSavedAct());
            reset(emptyFormValues);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      header={
        <RoleHeader
          badge="Veedor · Escrutinio"
          title="Registrar acta electoral"
          subtitle="Selecciona mesa, dignidad e ingresa los votos del acta física."
          onBack={() => navigation.goBack()}
        />
      }
    >
      <AuthNotice
        success
        message="Solo puedes registrar actas de tus mesas asignadas. La suma se verifica automáticamente y, al guardar, se abre la cámara para tomar la foto con GPS."
      />

      {/* Paso 1: Mesa */}
      <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-extrabold text-electoral-navy">
            1. Mesa electoral
          </Text>
          <StatusBadge
            label={`${catalog.tables.length} asignada(s)`}
            tone="cyan"
          />
        </View>
        {catalog.tables.map((table) => (
          <SelectableOption
            key={table.id}
            label={`Mesa / JRV ${table.tableNumber}`}
            description={`${table.pollingPlaceName}${
              table.pollingPlaceCode ? ` · ${table.pollingPlaceCode}` : ""
            }`}
            selected={watchedValues.electoralTableId === String(table.id)}
            onPress={() => {
              setValue("electoralTableId", String(table.id), {
                shouldValidate: true,
                shouldDirty: true,
              });
              if (saveStatus === "failed") {
                dispatch(clearSavedAct());
              }
            }}
          />
        ))}
        {errors.electoralTableId ? (
          <Text className="text-xs font-semibold text-electoral-red">
            ⚠ {errors.electoralTableId.message}
          </Text>
        ) : null}
      </View>

      {/* Paso 2: Dignidad */}
      <View className="gap-3 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
        <Text className="text-base font-extrabold text-electoral-navy">
          2. Dignidad electoral
        </Text>
        {catalog.positions.map((position) => (
          <SelectableOption
            key={position.id}
            label={position.name}
            selected={watchedValues.positionId === String(position.id)}
            onPress={() => selectPosition(String(position.id))}
          />
        ))}
        {errors.positionId ? (
          <Text className="text-xs font-semibold text-electoral-red">
            ⚠ {errors.positionId.message}
          </Text>
        ) : null}
      </View>

      {/* Paso 3: Votos */}
      {selectedPositionId ? (
        <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
          <View className="flex-row items-center justify-between border-b border-electoral-border pb-3">
            <Text className="text-base font-extrabold text-electoral-navy">
              3. Votos por candidatura
            </Text>
            <StatusBadge
              label={`${selectedCandidates.length} listas`}
              tone="navy"
            />
          </View>

          {selectedCandidates.map((candidate, index) => (
            <Controller
              key={candidate.id}
              control={control}
              name={`candidateVotes.${index}`}
              render={({ field, fieldState }) => (
                <View className="gap-1.5 rounded-xl bg-electoral-background/70 p-3.5">
                  <Text className="text-xs font-extrabold uppercase tracking-wide text-electoral-cyan">
                    {candidate.organizationName}
                  </Text>
                  <AuthField
                    label={candidate.fullName}
                    value={field.value ?? ""}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
              )}
            />
          ))}

          <View className="mt-2 gap-4 border-t border-electoral-border pt-4">
            <Text className="text-base font-extrabold text-electoral-navy">
              4. Totales del acta
            </Text>
            <Controller
              control={control}
              name="blankVotes"
              render={({ field, fieldState }) => (
                <AuthField
                  label="Votos en blanco"
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              )}
            />
            <Controller
              control={control}
              name="nullVotes"
              render={({ field, fieldState }) => (
                <AuthField
                  label="Votos nulos"
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              )}
            />
            <Controller
              control={control}
              name="totalVotes"
              render={({ field, fieldState }) => (
                <AuthField
                  label="Total de sufragantes"
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              )}
            />
            <Controller
              control={control}
              name="observations"
              render={({ field }) => (
                <AuthField
                  label="Observaciones (opcional)"
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  multiline
                  className="min-h-24 py-3"
                />
              )}
            />
          </View>

          <ActValidationFeedback validation={validation} />
          {saveError ? <AuthNotice message={saveError} /> : null}

          <View className="gap-3 rounded-2xl border border-electoral-cyan bg-electoral-cyan-light/40 p-4">
            <Text className="text-base font-extrabold text-electoral-navy">
              5. Evidencia fotográfica y GPS
            </Text>
            <Text className="text-sm leading-5 text-electoral-muted">
              Al guardar el acta se abre la cámara. La foto se verifica localmente
              y conserva las coordenadas del lugar donde se tomó, también sin conexión.
            </Text>
            <PrimaryButton
              label="Guardar acta y tomar foto →"
              loading={saveStatus === "loading"}
              disabled={!validation.isValid || saveStatus === "loading"}
              onPress={() => void handleSubmit(submit)()}
            />
          </View>
        </View>
      ) : (
        <AuthNotice message="Selecciona una dignidad arriba para desplegar la papeleta de votación." />
      )}
    </AppShell>
  );
}
