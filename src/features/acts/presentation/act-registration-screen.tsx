import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthShell,
  LoadingScreen,
  PrimaryButton,
} from '@/features/auth/presentation/components/auth-ui';
import { userRoles } from '@/features/auth/domain/user-profile';
import {
  type ElectoralActFormInput,
  validateElectoralActForm,
} from '@/features/acts/domain/electoral-act';
import {
  clearActRegistrationError,
  clearSavedAct,
  loadActRegistrationCatalog,
  submitElectoralAct,
} from '@/features/acts/presentation/act-registration-slice';
import { ActValidationFeedback } from '@/features/acts/presentation/components/act-validation-feedback';
import type { WorkspaceStackParamList } from '@/navigation/types';
import { useAppDispatch, useAppSelector } from '@/store/store';

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
        code: 'custom',
        path: ['electoralTableId'],
        message: 'Selecciona una mesa electoral.',
      });
    }
    if (!values.positionId) {
      context.addIssue({
        code: 'custom',
        path: ['positionId'],
        message: 'Selecciona una dignidad electoral.',
      });
    }
    for (const issue of validateElectoralActForm(toActFormInput(values)).issues) {
      context.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
      });
    }
  });

type RegistrationFormValues = z.input<typeof registrationSchema>;
type ScreenProps = NativeStackScreenProps<
  WorkspaceStackParamList,
  'ActRegistration'
>;

const emptyFormValues: RegistrationFormValues = {
  electoralTableId: '',
  positionId: '',
  candidateVotes: [],
  blankVotes: '',
  nullVotes: '',
  totalVotes: '',
  observations: '',
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
    'candidateVotes' | 'blankVotes' | 'nullVotes' | 'totalVotes' | 'observations'
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
      className={`rounded-xl border p-4 ${
        selected
          ? 'border-electoral-cyan bg-electoral-cyan-light'
          : 'border-electoral-border bg-white'
      }`}
      onPress={onPress}>
      <Text className="text-base font-bold text-electoral-navy">{label}</Text>
      {description ? (
        <Text className="mt-1 text-sm leading-5 text-electoral-muted">
          {description}
        </Text>
      ) : null}
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
    mode: 'onChange',
  });
  const watchedValues = useWatch({ control }) as RegistrationFormValues;
  const selectedPositionId = watchedValues.positionId ?? '';
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

  if (catalogStatus === 'idle' || catalogStatus === 'loading') {
    return <LoadingScreen message="Cargando mesas, dignidades y candidaturas…" />;
  }

  if (catalogStatus === 'failed') {
    return (
      <AuthShell>
        <AuthHeading
          title="Registro de actas"
          description="No fue posible preparar el formulario de registro."
        />
        <AuthNotice
          message={
            catalogError ??
            'No se pudo cargar la información necesaria para registrar actas.'
          }
        />
        <PrimaryButton
          label="Reintentar"
          onPress={() => {
            dispatch(clearActRegistrationError());
            void dispatch(loadActRegistrationCatalog(profile.id));
          }}
        />
        <PrimaryButton label="Volver" onPress={() => navigation.goBack()} />
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
    setValue('positionId', positionId, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue(
      'candidateVotes',
      candidates.map(() => ''),
      { shouldValidate: true, shouldDirty: true },
    );
    if (saveStatus === 'failed' || saveStatus === 'succeeded') {
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

  if (saveStatus === 'succeeded' && savedAct) {
    return (
      <AuthShell>
        <AuthHeading
          title="Acta registrada"
          description={
            savedOffline
              ? 'El acta quedó guardada en el dispositivo y se enviará al recuperar la conexión.'
              : 'El acta quedó guardada y pendiente de revisión.'
          }
        />
        <AuthNotice
          success={!savedOffline}
          message={`Acta ${savedAct.id} registrada para la mesa ${savedAct.electoralTableId}. Estado: ${savedAct.status}.`}
        />
        <PrimaryButton
          label="Continuar con la evidencia"
          onPress={() => navigation.navigate('EvidenceCapture', { actId: savedAct.id })}
        />
        {savedOffline ? (
          <PrimaryButton
            label="Ver registros pendientes"
            onPress={() => navigation.navigate('OfflineHistory')}
          />
        ) : null}
        <PrimaryButton
          label="Registrar otra acta"
          onPress={() => {
            dispatch(clearSavedAct());
            reset(emptyFormValues);
          }}
        />
        <PrimaryButton label="Volver" onPress={() => navigation.goBack()} />
      </AuthShell>
    );
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
        title="Registrar acta electoral"
        description="Selecciona la mesa y la dignidad, ingresa los votos y verifica que la suma coincida con el total."
      />
      <AuthNotice message="Solo puedes registrar actas de las mesas que tienes asignadas. El registro queda pendiente de revisión." />

      <View className="gap-3">
        <Text className="text-sm font-bold text-electoral-navy">Mesa electoral</Text>
        {catalog.tables.map((table) => (
          <SelectableOption
            key={table.id}
            label={`Mesa ${table.tableNumber}`}
            description={`${table.pollingPlaceName}${
              table.pollingPlaceCode ? ` · ${table.pollingPlaceCode}` : ''
            }`}
            selected={watchedValues.electoralTableId === String(table.id)}
            onPress={() => {
              setValue('electoralTableId', String(table.id), {
                shouldValidate: true,
                shouldDirty: true,
              });
              if (saveStatus === 'failed') {
                dispatch(clearSavedAct());
              }
            }}
          />
        ))}
        {errors.electoralTableId ? (
          <Text className="text-sm text-electoral-red">
            {errors.electoralTableId.message}
          </Text>
        ) : null}
      </View>

      <View className="gap-3">
        <Text className="text-sm font-bold text-electoral-navy">Dignidad</Text>
        {catalog.positions.map((position) => (
          <SelectableOption
            key={position.id}
            label={position.name}
            selected={watchedValues.positionId === String(position.id)}
            onPress={() => selectPosition(String(position.id))}
          />
        ))}
        {errors.positionId ? (
          <Text className="text-sm text-electoral-red">
            {errors.positionId.message}
          </Text>
        ) : null}
      </View>

      {selectedPositionId ? (
        <View className="gap-4">
          <Text className="text-lg font-bold text-electoral-navy">
            Votos por candidatura
          </Text>
          {selectedCandidates.map((candidate, index) => (
            <Controller
              key={candidate.id}
              control={control}
              name={`candidateVotes.${index}`}
              render={({ field, fieldState }) => (
                <View className="gap-1">
                  <AuthField
                    label={`Votos para ${candidate.fullName}`}
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    keyboardType="number-pad"
                  />
                  <Text className="text-sm text-electoral-muted">
                    {candidate.organizationName}
                  </Text>
                </View>
              )}
            />
          ))}

          <Controller
            control={control}
            name="blankVotes"
            render={({ field, fieldState }) => (
              <AuthField
                label="Votos en blanco"
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
                keyboardType="number-pad"
              />
            )}
          />
          <Controller
            control={control}
            name="nullVotes"
            render={({ field, fieldState }) => (
              <AuthField
                label="Votos nulos"
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
                keyboardType="number-pad"
              />
            )}
          />
          <Controller
            control={control}
            name="totalVotes"
            render={({ field, fieldState }) => (
              <AuthField
                label="Total de sufragantes"
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
                keyboardType="number-pad"
              />
            )}
          />
          <Controller
            control={control}
            name="observations"
            render={({ field }) => (
              <AuthField
                label="Observaciones"
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                multiline
                className="min-h-24 py-3"
              />
            )}
          />

          <ActValidationFeedback validation={validation} />
          {saveError ? <AuthNotice message={saveError} /> : null}
          <PrimaryButton
            label="Guardar acta"
            loading={saveStatus === 'loading'}
            disabled={!validation.isValid || saveStatus === 'loading'}
            onPress={() => void handleSubmit(submit)()}
          />
        </View>
      ) : (
        <AuthNotice message="Selecciona una dignidad para ingresar los votos del acta." />
      )}
    </AuthShell>
  );
}
