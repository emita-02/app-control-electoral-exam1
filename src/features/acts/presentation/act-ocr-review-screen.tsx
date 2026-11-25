import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
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
import type { ActOcrResult } from '@/features/acts/domain/act-ocr';
import {
  type ElectoralActFormInput,
  validateElectoralActForm,
} from '@/features/acts/domain/electoral-act';
import {
  clearActConfirmation,
  confirmActResults,
} from '@/features/acts/presentation/act-confirmation-slice';
import {
  clearActOcr,
  loadQueuedActOcrResult,
  requestActOcr,
} from '@/features/acts/presentation/act-ocr-slice';
import { ActValidationFeedback } from '@/features/acts/presentation/components/act-validation-feedback';
import { clearOcrReview } from '@/features/offline/presentation/offline-slice';
import type { WorkspaceStackParamList } from '@/navigation/types';
import { useAppDispatch, useAppSelector } from '@/store/store';

const editableVote = z.string().refine((value) => {
  const normalized = value.trim();
  return (
    normalized.length === 0 ||
    (/^\d+$/.test(normalized) && Number.isSafeInteger(Number(normalized)))
  );
}, 'Ingresa un número entero no negativo.');

const reviewSchema = z
  .object({
    candidateVotes: z.array(editableVote),
    blankVotes: editableVote,
    nullVotes: editableVote,
    totalVotes: editableVote,
  })
  .superRefine((values, context) => {
    const formValues = toActFormInput(values);
    for (const issue of validateElectoralActForm(formValues).issues) {
      if (issue.path.length > 0) {
        context.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        });
      }
    }
  });

type ReviewValues = z.input<typeof reviewSchema>;
type ScreenProps = NativeStackScreenProps<
  WorkspaceStackParamList,
  'ActOcrReview'
>;

function voteText(value: number | null): string {
  return value === null ? '' : String(value);
}

function toVote(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const vote = Number(normalized);
  return Number.isSafeInteger(vote) ? vote : null;
}

function toActFormInput(values: ReviewValues): ElectoralActFormInput {
  return {
    candidateVotes: values.candidateVotes.map(toVote),
    blankVotes: toVote(values.blankVotes),
    nullVotes: toVote(values.nullVotes),
    totalVotes: toVote(values.totalVotes),
    observations: '',
  };
}

function ActOcrResultReview({
  result,
  reviewKey,
}: {
  result: ActOcrResult;
  reviewKey?: string;
}) {
  const dispatch = useAppDispatch();
  const confirmation = useAppSelector((state) => state.actConfirmation);
  const [observation, setObservation] = useState('');
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      candidateVotes: result.results.map((candidate) =>
        voteText(candidate.votes)
      ),
      blankVotes: voteText(result.blankVotes),
      nullVotes: voteText(result.nullVotes),
      totalVotes: voteText(result.totalVotes),
    },
    mode: 'onChange',
  });
  const candidateVotes = useWatch({
    control: form.control,
    name: 'candidateVotes',
    defaultValue: form.getValues('candidateVotes'),
  });
  const blankVotes = useWatch({
    control: form.control,
    name: 'blankVotes',
    defaultValue: form.getValues('blankVotes'),
  });
  const nullVotes = useWatch({
    control: form.control,
    name: 'nullVotes',
    defaultValue: form.getValues('nullVotes'),
  });
  const totalVotes = useWatch({
    control: form.control,
    name: 'totalVotes',
    defaultValue: form.getValues('totalVotes'),
  });
  const values: ReviewValues = {
    candidateVotes,
    blankVotes,
    nullVotes,
    totalVotes,
  };
  const validation = validateElectoralActForm(toActFormInput(values));

  const confirm = async () => {
    if (!validation.isValid) {
      return;
    }
    const candidateVotes = result.results.map((candidate, index) => {
      const candidateId = Number(candidate.candidateId);
      if (!Number.isSafeInteger(candidateId) || candidateId <= 0) {
        throw new Error('Una candidatura del reconocimiento no es válida.');
      }
      return { candidateId, votes: validation.values.candidateVotes[index] };
    });

    try {
      await dispatch(
        confirmActResults({
          action: 'confirm_ocr',
          actId: result.actId,
          candidateVotes,
          blankVotes: validation.values.blankVotes,
          nullVotes: validation.values.nullVotes,
          totalVotes: validation.values.totalVotes,
          observation: observation.trim() || null,
          reason: 'Confirmación humana de los valores revisados del OCR',
          ocrData: result as unknown as Record<string, unknown>,
        }),
      ).unwrap();
      if (reviewKey) {
        void dispatch(clearOcrReview(reviewKey));
      }
    } catch {
      // El mensaje se muestra desde el estado de actConfirmation.
    }
  };

  return (
    <View className="gap-5">
      <View className="gap-1 rounded-xl border border-electoral-border bg-white p-4">
        <Text className="text-base font-bold text-electoral-navy">
          {result.position.name}
        </Text>
        <Text className="text-sm text-electoral-muted">
          Revisión OCR · Acta {result.actId}
        </Text>
      </View>

      <AuthNotice
        message="Los datos son sugerencias del OCR. Revisa y edita cada valor: nada se registra como oficial hasta que confirmes manualmente."
      />

      {result.results.map((candidate, index) => (
        <View
          key={candidate.candidateId}
          className="gap-3 rounded-xl border border-electoral-border bg-white p-4">
          <View className="gap-1">
            <Text className="text-base font-bold text-electoral-navy">
              {candidate.candidateName}
            </Text>
            <Text className="text-sm text-electoral-muted">
              {candidate.politicalOrganization}
            </Text>
            <Text className="text-sm text-electoral-muted">
              Valor detectado: {candidate.votes ?? 'No identificado'}
            </Text>
            {!candidate.readable ? (
              <Text className="text-sm font-semibold text-electoral-red">
                Requiere revisión manual
              </Text>
            ) : null}
          </View>
          <Controller
            control={form.control}
            name={`candidateVotes.${index}`}
            render={({ field, fieldState }) => (
              <AuthField
                label="Votos revisados"
                value={field.value}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
                keyboardType="number-pad"
              />
            )}
          />
        </View>
      ))}

      {(
        [
          ['blankVotes', 'Votos en blanco', result.blankVotes],
          ['nullVotes', 'Votos nulos', result.nullVotes],
          ['totalVotes', 'Total de sufragantes', result.totalVotes],
        ] as const
      ).map(([name, label, extractedValue]) => (
        <View
          key={name}
          className="gap-2 rounded-xl border border-electoral-border bg-white p-4">
          <Text className="text-sm text-electoral-muted">
            Valor detectado: {extractedValue ?? 'No identificado'}
          </Text>
          <Controller
            control={form.control}
            name={name}
            render={({ field, fieldState }) => (
              <AuthField
                label={label}
                value={field.value}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
                keyboardType="number-pad"
              />
            )}
          />
        </View>
      ))}

      {result.warnings.length > 0 ? (
        <View className="gap-2 rounded-xl border border-electoral-red bg-white p-4">
          <Text className="text-sm font-bold text-electoral-navy">
            Observaciones de lectura
          </Text>
          {result.warnings.map((warning, index) => (
            <Text
              key={`${index}-${warning}`}
              className="text-sm leading-5 text-electoral-red">
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <ActValidationFeedback validation={validation} />
      {result.arithmeticValid === false ? (
        <AuthNotice message="La suma reconocida no coincide con el total. Verifica los valores en la fotografía." />
      ) : null}

      <AuthField
        label="Observaciones de la revisión (opcional)"
        value={observation}
        onChangeText={setObservation}
        multiline
        className="min-h-24 py-3"
      />
      {confirmation.status === 'failed' ? (
        <AuthNotice
          message={confirmation.error ?? 'No se pudo confirmar el acta.'}
        />
      ) : null}
      {confirmation.status === 'succeeded' ? (
        <AuthNotice
          success
          message={
            confirmation.savedOffline
              ? 'La confirmación quedó pendiente de sincronización.'
              : 'Resultados confirmados y registrados con revisión humana.'
          }
        />
      ) : null}
      <PrimaryButton
        label="Confirmar resultados revisados"
        loading={confirmation.status === 'loading'}
        disabled={!validation.isValid || confirmation.status === 'loading'}
        onPress={() => void confirm()}
      />
    </View>
  );
}

export function ActOcrReviewScreen({
  navigation,
  route,
}: ScreenProps) {
  const dispatch = useAppDispatch();
  const { result, status, error } = useAppSelector((state) => state.actOcr);
  const online = useAppSelector((state) => state.offline.online);
  const { actId, evidenceId, reviewKey } = route.params;
  const isLocal = actId <= 0 || evidenceId <= 0;
  const currentResult =
    result?.actId === actId && result.evidenceId === evidenceId
      ? result
      : null;

  useEffect(() => {
    dispatch(clearActOcr());
    dispatch(clearActConfirmation());
    if (!online) {
      return;
    }
    const request = isLocal
      ? dispatch(loadQueuedActOcrResult({ actId, evidenceId }))
      : dispatch(requestActOcr({ actId, evidenceId }));
    return () => {
      request.abort();
      dispatch(clearActOcr());
    };
  }, [actId, dispatch, evidenceId, isLocal, online]);

  if (
    status === 'loading' ||
    (status === 'idle' && online && !isLocal) ||
    (status === 'succeeded' && !currentResult)
  ) {
    return <LoadingScreen message="Analizando la fotografía del acta…" />;
  }

  return (
    <AuthShell>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center"
        onPress={() => navigation.goBack()}>
        <Text className="text-base font-semibold text-electoral-navy">
          Volver
        </Text>
      </Pressable>
      <AuthHeading
        title="Revisar reconocimiento OCR"
        description="Comprueba los valores extraídos. La lectura automática no constituye una confirmación ni se registra como resultado oficial."
      />

      {status === 'failed' ? (
        <>
          <AuthNotice message={error ?? 'No se pudo procesar la fotografía.'} />
          {online ? (
            <PrimaryButton
              label="Reintentar reconocimiento"
              onPress={() => {
                void dispatch(
                  isLocal
                    ? loadQueuedActOcrResult({ actId, evidenceId })
                    : requestActOcr({ actId, evidenceId }),
                );
              }}
            />
          ) : null}
        </>
      ) : currentResult ? (
        <ActOcrResultReview result={currentResult} reviewKey={reviewKey} />
      ) : (
        <>
          <AuthNotice
            message={
              isLocal
                ? 'El acta y la evidencia se guardaron en el dispositivo. El reconocimiento estará disponible después de sincronizar.'
                : 'Sin conexión. La evidencia y el reconocimiento se procesarán al recuperar la conectividad.'
            }
          />
          <PrimaryButton
            label="Ver registros pendientes"
            onPress={() => navigation.navigate('OfflineHistory')}
          />
        </>
      )}
    </AuthShell>
  );
}
