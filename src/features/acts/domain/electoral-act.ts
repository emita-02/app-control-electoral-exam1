import {
  userRoles,
  type UserProfile,
} from '../../auth/domain/user-profile.ts';

import { validateElectoralActArithmetic } from './validate-electoral-act-arithmetic.ts';

export type ElectoralActValues = {
  candidateVotes: readonly {
    candidateReference: string;
    candidateName: string;
    votes: number;
  }[];
  blankVotes: number;
  nullVotes: number;
  totalVotes: number;
  observations: string;
};

export type ElectoralActFormInput = {
  candidateVotes: readonly (number | null)[];
  blankVotes: number | null;
  nullVotes: number | null;
  totalVotes: number | null;
  observations: string;
};

export type ElectoralActValidationIssue = {
  path: (string | number)[];
  message: string;
};

export type CompleteElectoralActFormInput = {
  candidateVotes: readonly number[];
  blankVotes: number;
  nullVotes: number;
  totalVotes: number;
  observations: string;
};

export type ElectoralActValidation =
  | {
      isValid: true;
      issues: [];
      values: CompleteElectoralActFormInput;
    }
  | {
      isValid: false;
      issues: ElectoralActValidationIssue[];
    };

export type ElectoralActCorrectionContext = {
  reference: string;
  authorId: string;
  pollingPlaceId: number;
  electoralTableId: number;
  currentValues: ElectoralActValues;
};

export type ActCorrectionProposal = {
  actReference: string;
  previousValues: ElectoralActValues;
  correctedValues: ElectoralActValues;
  correctedBy: {
    userId: string;
    fullName: string;
    role: UserProfile['role'];
  };
  correctedAt: string;
  reason: string;
};

export function validateElectoralActForm(
  input: ElectoralActFormInput,
): ElectoralActValidation {
  const issues: ElectoralActValidationIssue[] = [];

  input.candidateVotes.forEach((votes, index) => {
    if (votes === null) {
      issues.push({
        path: ['candidateVotes', index],
        message: 'Ingresa los votos de esta candidatura.',
      });
    }
  });

  if (input.blankVotes === null) {
    issues.push({
      path: ['blankVotes'],
      message: 'Ingresa los votos en blanco.',
    });
  }
  if (input.nullVotes === null) {
    issues.push({
      path: ['nullVotes'],
      message: 'Ingresa los votos nulos.',
    });
  }
  if (input.totalVotes === null) {
    issues.push({
      path: ['totalVotes'],
      message: 'Ingresa el total de sufragantes.',
    });
  }

  if (issues.length > 0) {
    return { isValid: false, issues };
  }
  if (
    input.candidateVotes.some((votes) => votes === null) ||
    input.blankVotes === null ||
    input.nullVotes === null ||
    input.totalVotes === null
  ) {
    return { isValid: false, issues };
  }

  const completeValues: CompleteElectoralActFormInput = {
    candidateVotes: input.candidateVotes.filter(
      (votes): votes is number => votes !== null,
    ),
    blankVotes: input.blankVotes,
    nullVotes: input.nullVotes,
    totalVotes: input.totalVotes,
    observations: input.observations,
  };
  const arithmetic = validateElectoralActArithmetic({
    candidateVotes: completeValues.candidateVotes,
    blankVotes: completeValues.blankVotes,
    nullVotes: completeValues.nullVotes,
    totalVotes: completeValues.totalVotes,
  });

  if (arithmetic.isValid) {
    return { isValid: true, issues: [], values: completeValues };
  }

  return {
    isValid: false,
    issues: [
      {
        path:
          arithmetic.accountedVotes === null
            ? input.candidateVotes.length === 0
              ? ['candidateVotes']
              : []
            : ['totalVotes'],
        message: arithmetic.error ?? 'Revisa los valores registrados.',
      },
    ],
  };
}

export function canCorrectElectoralAct(
  actor: Pick<UserProfile, 'id' | 'role' | 'pollingPlaceId'>,
  act: Pick<
    ElectoralActCorrectionContext,
    'authorId' | 'electoralTableId' | 'pollingPlaceId'
  >,
  assignedTableIds: readonly number[],
): boolean {
  if (actor.role === userRoles.precinctCoordinator) {
    return (
      actor.pollingPlaceId !== null &&
      actor.pollingPlaceId === act.pollingPlaceId
    );
  }

  // S-04: el acta conserva a su autor original, pero el veedor que hereda la
  // mesa puede revisar y corregir las actas existentes de esa mesa.
  return (
    actor.role === userRoles.observer &&
    assignedTableIds.includes(act.electoralTableId)
  );
}
