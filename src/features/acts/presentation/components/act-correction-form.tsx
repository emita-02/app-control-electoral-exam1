import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';
import { z } from 'zod';

import {
  AuthField,
  AuthHeading,
  AuthNotice,
  PrimaryButton,
} from '@/features/auth/presentation/components/auth-ui';
import { prepareActCorrection } from '@/features/acts/application/prepare-act-correction';
import {
  canCorrectElectoralAct,
  type ActCorrectionProposal,
  type ElectoralActCorrectionContext,
  type ElectoralActFormInput,
  validateElectoralActForm,
} from '@/features/acts/domain/electoral-act';
import { ActValidationFeedback } from '@/features/acts/presentation/components/act-validation-feedback';
import { useAppSelector } from '@/store/store';

const correctionFormSchema = z
  .object({
    candidateVotes: z.array(z.string()),
    blankVotes: z.string(),
    nullVotes: z.string(),
    totalVotes: z.string(),
    observations: z.string(),
    reason: z.string().trim().min(1, 'Indica el motivo de la corrección.'),
  })
  .superRefine((values, context) => {
    const validation = validateElectoralActForm(toActFormInput(values));
    for (const issue of validation.issues) {
      context.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
      });
    }
  });

type CorrectionFormValues = z.input<typeof correctionFormSchema>;
type ActCorrectionFormProps = {
  act: ElectoralActCorrectionContext;
  assignedTableIds: readonly number[];
  onCorrectionPrepared: (proposal: ActCorrectionProposal) => void;
};

function asVote(value: string): number | null {
  const normalized = value.trim();
  return normalized ? Number(normalized) : null;
}

function toActFormInput(values: CorrectionFormValues): ElectoralActFormInput {
  return {
    candidateVotes: values.candidateVotes.map(asVote),
    blankVotes: asVote(values.blankVotes),
    nullVotes: asVote(values.nullVotes),
    totalVotes: asVote(values.totalVotes),
    observations: values.observations,
  };
}

function correctionValues(
  act: ElectoralActCorrectionContext,
): CorrectionFormValues {
  return {
    candidateVotes: act.currentValues.candidateVotes.map((candidate) =>
      String(candidate.votes),
    ),
    blankVotes: String(act.currentValues.blankVotes),
    nullVotes: String(act.currentValues.nullVotes),
    totalVotes: String(act.currentValues.totalVotes),
    observations: act.currentValues.observations,
    reason: '',
  };
}

function CorrectionSnapshot({
  title,
  values,
}: {
  title: string;
  values: ElectoralActCorrectionContext['currentValues'];
}) {
  return (
    <View className="gap-2 rounded-xl border border-electoral-border bg-white p-4">
      <Text className="text-base font-bold text-electoral-navy">{title}</Text>
      {values.candidateVotes.map((candidate) => (
        <Text
          key={candidate.candidateReference}
          className="text-sm leading-5 text-electoral-text">
          {candidate.candidateName}: {candidate.votes}
        </Text>
      ))}
      <Text className="text-sm leading-5 text-electoral-text">
        Blancos: {values.blankVotes} · Nulos: {values.nullVotes} · Total: {values.totalVotes}
      </Text>
      {values.observations ? (
        <Text className="text-sm leading-5 text-electoral-muted">
          Observación: {values.observations}
        </Text>
      ) : null}
    </View>
  );
}

export function ActCorrectionForm({
  act,
  assignedTableIds,
  onCorrectionPrepared,
}: ActCorrectionFormProps) {
  return (
    <ActCorrectionFormForAct
      key={act.reference}
      act={act}
      assignedTableIds={assignedTableIds}
      onCorrectionPrepared={onCorrectionPrepared}
    />
  );
}

function ActCorrectionFormForAct({
  act,
  assignedTableIds,
  onCorrectionPrepared,
}: ActCorrectionFormProps) {
  const profile = useAppSelector((state) => state.auth.profile);
  const [proposal, setProposal] = useState<ActCorrectionProposal | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const form = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionFormSchema),
    defaultValues: correctionValues(act),
    mode: 'onChange',
  });
  useWatch({ control: form.control });
  const validation = validateElectoralActForm(
    toActFormInput(form.getValues()),
  );
  const canEdit =
    profile !== null &&
    canCorrectElectoralAct(profile, act, assignedTableIds);

  const clearProposal = () => {
    setProposal(null);
    setActionError(null);
  };

  const submitCorrection = (values: CorrectionFormValues) => {
    if (!profile) {
      setActionError('Inicia sesión nuevamente para preparar la corrección.');
      return;
    }

    const result = prepareActCorrection({
      act,
      actor: profile,
      assignedTableIds,
      values: toActFormInput(values),
      reason: values.reason,
    });
    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    setActionError(null);
    setProposal(result.proposal);
    onCorrectionPrepared(result.proposal);
  };

  if (!canEdit) {
    return (
      <AuthNotice message="No tienes autorización para corregir esta acta. El veedor solo puede corregir sus actas de mesas asignadas; el coordinador de recinto, las de su recinto." />
    );
  }

  return (
    <View className="gap-5">
      <AuthHeading
        title="Corregir acta"
        description="Revisa los valores, completa el motivo y valida la suma antes de preparar la corrección."
      />

      <View className="gap-4">
        {act.currentValues.candidateVotes.map((candidate, index) => (
          <Controller
            key={candidate.candidateReference}
            control={form.control}
            name={`candidateVotes.${index}`}
            render={({ field, fieldState }) => (
              <AuthField
                label={`Votos de ${candidate.candidateName}`}
                value={field.value}
                onBlur={field.onBlur}
                onChangeText={(value) => {
                  clearProposal();
                  field.onChange(value);
                }}
                error={fieldState.error?.message}
                keyboardType="number-pad"
              />
            )}
          />
        ))}

        <Controller
          control={form.control}
          name="blankVotes"
          render={({ field, fieldState }) => (
            <AuthField
              label="Votos en blanco"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={(value) => {
                clearProposal();
                field.onChange(value);
              }}
              error={fieldState.error?.message}
              keyboardType="number-pad"
            />
          )}
        />
        <Controller
          control={form.control}
          name="nullVotes"
          render={({ field, fieldState }) => (
            <AuthField
              label="Votos nulos"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={(value) => {
                clearProposal();
                field.onChange(value);
              }}
              error={fieldState.error?.message}
              keyboardType="number-pad"
            />
          )}
        />
        <Controller
          control={form.control}
          name="totalVotes"
          render={({ field, fieldState }) => (
            <AuthField
              label="Total de sufragantes"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={(value) => {
                clearProposal();
                field.onChange(value);
              }}
              error={fieldState.error?.message}
              keyboardType="number-pad"
            />
          )}
        />
        <Controller
          control={form.control}
          name="observations"
          render={({ field }) => (
            <AuthField
              label="Observaciones"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={(value) => {
                clearProposal();
                field.onChange(value);
              }}
              multiline
              className="min-h-24 py-3"
            />
          )}
        />
        <Controller
          control={form.control}
          name="reason"
          render={({ field, fieldState }) => (
            <AuthField
              label="Motivo de la corrección"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={(value) => {
                clearProposal();
                field.onChange(value);
              }}
              error={fieldState.error?.message}
              multiline
              className="min-h-24 py-3"
            />
          )}
        />
      </View>

      <ActValidationFeedback validation={validation} />
      {actionError ? <AuthNotice message={actionError} /> : null}
      <PrimaryButton
        label="Preparar corrección para revisión"
        onPress={() => void form.handleSubmit(submitCorrection)()}
        disabled={!validation.isValid}
      />

      {proposal ? (
        <View className="gap-3">
          <AuthNotice message="Propuesta preparada para revisión humana. Todavía no está guardada ni enviada." success />
          <CorrectionSnapshot
            title="Valores anteriores"
            values={proposal.previousValues}
          />
          <CorrectionSnapshot
            title="Valores propuestos"
            values={proposal.correctedValues}
          />
          <View className="gap-1 rounded-xl border border-electoral-border bg-white p-4">
            <Text className="text-sm font-semibold text-electoral-navy">
              Responsable: {proposal.correctedBy.fullName}
            </Text>
            <Text className="text-sm text-electoral-muted">
              Fecha: {proposal.correctedAt}
            </Text>
            <Text className="text-sm leading-5 text-electoral-text">
              Motivo: {proposal.reason}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
