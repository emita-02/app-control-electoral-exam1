import type { UserProfile } from '../../auth/domain/user-profile';
import {
  canCorrectElectoralAct,
  validateElectoralActForm,
  type ActCorrectionProposal,
  type ElectoralActCorrectionContext,
  type ElectoralActFormInput,
} from '../domain/electoral-act.ts';

export type PrepareActCorrectionInput = {
  act: ElectoralActCorrectionContext;
  actor: UserProfile;
  assignedTableIds: readonly number[];
  values: ElectoralActFormInput;
  reason: string;
  now?: Date;
};

export type PrepareActCorrectionResult =
  | { ok: true; proposal: ActCorrectionProposal }
  | {
      ok: false;
      message: string;
      issues?: ReturnType<typeof validateElectoralActForm>['issues'];
    };

function cloneActValues(
  values: ElectoralActCorrectionContext['currentValues'],
): ElectoralActCorrectionContext['currentValues'] {
  return {
    ...values,
    candidateVotes: values.candidateVotes.map((candidate) => ({ ...candidate })),
  };
}

export function prepareActCorrection(
  input: PrepareActCorrectionInput,
): PrepareActCorrectionResult {
  if (
    !canCorrectElectoralAct(
      input.actor,
      input.act,
      input.assignedTableIds,
    )
  ) {
    return {
      ok: false,
      message: 'No tienes autorización para corregir esta acta.',
    };
  }

  const reason = input.reason.trim();
  if (!reason) {
    return {
      ok: false,
      message: 'Indica el motivo de la corrección.',
      issues: [
        {
          path: ['reason'],
          message: 'Indica el motivo de la corrección.',
        },
      ],
    };
  }

  const validation = validateElectoralActForm(input.values);
  if (!validation.isValid) {
    return {
      ok: false,
      message: 'Corrige los errores antes de preparar la propuesta.',
      issues: validation.issues,
    };
  }
  if (
    validation.values.candidateVotes.length !==
    input.act.currentValues.candidateVotes.length
  ) {
    return {
      ok: false,
      message: 'La lista de candidaturas no coincide con la del acta.',
      issues: [
        {
          path: ['candidateVotes'],
          message: 'La lista de candidaturas no coincide con la del acta.',
        },
      ],
    };
  }

  const timestamp = input.now ?? new Date();
  if (Number.isNaN(timestamp.getTime())) {
    return {
      ok: false,
      message: 'No se pudo determinar una fecha válida para la corrección.',
    };
  }

  const previousValues = cloneActValues(input.act.currentValues);
  const correctedValues = {
    ...cloneActValues(input.act.currentValues),
    candidateVotes: input.act.currentValues.candidateVotes.map(
      (candidate, index) => ({
        ...candidate,
        votes: validation.values.candidateVotes[index],
      }),
    ),
    blankVotes: validation.values.blankVotes,
    nullVotes: validation.values.nullVotes,
    totalVotes: validation.values.totalVotes,
    observations: validation.values.observations,
  };

  return {
    ok: true,
    proposal: {
      actReference: input.act.reference,
      previousValues,
      correctedValues,
      correctedBy: {
        userId: input.actor.id,
        fullName: input.actor.fullName,
        role: input.actor.role,
      },
      correctedAt: timestamp.toISOString(),
      reason,
    },
  };
}
