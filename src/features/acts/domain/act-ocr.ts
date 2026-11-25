export type ActOcrRequest = {
  actId: number;
  evidenceId: number;
};

export type ActOcrCandidateResult = {
  candidateId: string;
  candidateName: string;
  politicalOrganization: string;
  votes: number | null;
  readable: boolean;
};

export type ActOcrResult = {
  actId: number;
  evidenceId: number;
  position: {
    id: number | string;
    code: string;
    name: string;
  };
  results: ActOcrCandidateResult[];
  blankVotes: number | null;
  nullVotes: number | null;
  totalVotes: number | null;
  calculatedTotal: number | null;
  arithmeticValid: boolean | null;
  requiresManualReview: true;
  warnings: string[];
};

export interface ActOcrRepository {
  process(input: ActOcrRequest, signal?: AbortSignal): Promise<ActOcrResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readVote(value: unknown): number | null {
  if (
    value !== null &&
    (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error('El reconocimiento devolvió un valor de votos inválido.');
  }
  return value;
}

function readIdentifier(value: unknown): number | string {
  if (
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0) ||
    (typeof value === 'string' && value.trim().length > 0)
  ) {
    return value;
  }
  throw new Error('El reconocimiento devolvió una identificación inválida.');
}

function readText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('El reconocimiento devolvió datos incompletos.');
  }
  return value;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (value !== null && typeof value !== 'boolean') {
    throw new Error('El reconocimiento devolvió un estado aritmético inválido.');
  }
  return value;
}

export function parseActOcrResult(
  value: unknown,
  request: ActOcrRequest,
): ActOcrResult {
  if (!isRecord(value) || value.success !== true) {
    throw new Error('El servidor devolvió una respuesta OCR inválida.');
  }

  if (
    value.act_id !== request.actId ||
    value.evidence_id !== request.evidenceId ||
    value.requires_manual_review !== true ||
    !isRecord(value.position) ||
    !Array.isArray(value.results) ||
    value.results.length === 0 ||
    !Array.isArray(value.warnings)
  ) {
    throw new Error('El servidor devolvió una respuesta OCR incompleta.');
  }

  const rawResults: unknown[] = value.results;
  const rawWarnings: unknown[] = value.warnings;
  const arithmeticValid = readNullableBoolean(value.arithmetic_valid);
  const totalVotes = readVote(value.total_votes);
  const calculatedTotal = readVote(value.calculated_total);
  const warnings = rawWarnings.map((warning) => {
    if (typeof warning !== 'string') {
      throw new Error('El reconocimiento devolvió una observación inválida.');
    }
    return warning;
  });

  if (
    (arithmeticValid === null && calculatedTotal !== null) ||
    (arithmeticValid !== null &&
      (calculatedTotal === null ||
        totalVotes === null ||
        arithmeticValid !== (calculatedTotal === totalVotes)))
  ) {
    throw new Error('La validación aritmética del reconocimiento es inconsistente.');
  }

  const candidateIds = new Set<string>();
  const results = rawResults.map((result): ActOcrCandidateResult => {
    if (
      !isRecord(result) ||
      typeof result.readable !== 'boolean'
    ) {
      throw new Error('El servidor devolvió un candidato con formato inválido.');
    }

    const votes = readVote(result.votes);
    if (
      (result.readable && votes === null) ||
      (!result.readable && votes !== null)
    ) {
      throw new Error('El servidor devolvió una lectura de candidato inconsistente.');
    }

    const candidateId = readText(result.candidate_id);
    if (candidateIds.has(candidateId)) {
      throw new Error('El reconocimiento repitió una candidatura.');
    }
    candidateIds.add(candidateId);

    return {
      candidateId,
      candidateName: readText(result.candidate_name),
      politicalOrganization: readText(result.political_organization),
      votes,
      readable: result.readable,
    };
  });

  return {
    actId: request.actId,
    evidenceId: request.evidenceId,
    position: {
      id: readIdentifier(value.position.id),
      code: readText(value.position.code),
      name: readText(value.position.name),
    },
    results,
    blankVotes: readVote(value.blank_votes),
    nullVotes: readVote(value.null_votes),
    totalVotes,
    calculatedTotal,
    arithmeticValid,
    requiresManualReview: true,
    warnings,
  };
}
