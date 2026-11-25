export type ElectoralActArithmeticInput = {
  candidateVotes: readonly number[];
  blankVotes: number;
  nullVotes: number;
  totalVotes: number;
};

export type ElectoralActArithmeticValidation = {
  isValid: boolean;
  validVotes: number | null;
  accountedVotes: number | null;
  error: string | null;
};

export function validateElectoralActArithmetic(
  input: ElectoralActArithmeticInput,
): ElectoralActArithmeticValidation {
  if (input.candidateVotes.length === 0) {
    return {
      isValid: false,
      validVotes: null,
      accountedVotes: null,
      error: 'Registra los votos de los candidatos de esta dignidad.',
    };
  }

  const votes = [
    ...input.candidateVotes,
    input.blankVotes,
    input.nullVotes,
    input.totalVotes,
  ];
  if (
    votes.some(
      (vote) => !Number.isSafeInteger(vote) || vote < 0,
    )
  ) {
    return {
      isValid: false,
      validVotes: null,
      accountedVotes: null,
      error: 'Los votos deben ser números enteros no negativos.',
    };
  }

  const validVotes = input.candidateVotes.reduce((sum, vote) => sum + vote, 0);
  const accountedVotes = validVotes + input.blankVotes + input.nullVotes;
  if (!Number.isSafeInteger(validVotes) || !Number.isSafeInteger(accountedVotes)) {
    return {
      isValid: false,
      validVotes: null,
      accountedVotes: null,
      error: 'La suma de votos excede el rango numérico permitido.',
    };
  }

  const isValid = accountedVotes === input.totalVotes;
  return {
    isValid,
    validVotes,
    accountedVotes,
    error: isValid
      ? null
      : 'La suma de votos por candidato, blancos y nulos debe coincidir con el total.',
  };
}
