import type { ConfirmActInput } from '@/features/acts/domain/act-confirmation';
import type { ActCorrectionProposal } from '@/features/acts/domain/electoral-act';

/**
 * Convierte una propuesta revisada en la orden que se envía al backend.
 * La llamada a esta función debe hacerse solo después de que la persona
 * responsable autorice explícitamente la corrección (S-06).
 */
export function proposalToConfirmationInput(
  proposal: ActCorrectionProposal,
  actId: number,
): ConfirmActInput {
  return {
    action: 'apply_correction',
    actId,
    candidateVotes: proposal.correctedValues.candidateVotes.map((candidate) => ({
      candidateId: Number(candidate.candidateReference),
      votes: candidate.votes,
    })),
    blankVotes: proposal.correctedValues.blankVotes,
    nullVotes: proposal.correctedValues.nullVotes,
    totalVotes: proposal.correctedValues.totalVotes,
    observation: proposal.correctedValues.observations.trim()
      ? proposal.correctedValues.observations
      : null,
    reason: proposal.reason,
  };
}
