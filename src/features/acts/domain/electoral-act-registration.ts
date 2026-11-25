import { validateElectoralActForm } from './electoral-act.ts';

export type AssignedElectoralTable = {
  id: number;
  tableNumber: number;
  pollingPlaceName: string;
  pollingPlaceCode: string | null;
};

export type ElectoralActPosition = {
  id: number;
  code: string;
  name: string;
};

export type ElectoralActCandidate = {
  id: number;
  positionId: number;
  fullName: string;
  organizationName: string;
};

export type ElectoralActCatalog = {
  tables: AssignedElectoralTable[];
  positions: ElectoralActPosition[];
  candidates: ElectoralActCandidate[];
};

export type RegisterElectoralActInput = {
  electoralTableId: number;
  positionId: number;
  candidateVotes: readonly {
    candidateId: number;
    votes: number;
  }[];
  blankVotes: number;
  nullVotes: number;
  totalVotes: number;
  observation: string | null;
};

export type RegisteredElectoralAct = {
  id: number;
  electoralTableId: number;
  positionId: number;
  status: string;
  totalVotes: number;
  blankVotes: number;
  nullVotes: number;
  observation: string | null;
  registeredBy: string;
  createdAt: string;
};

export interface ElectoralActRepository {
  loadCatalog(watcherId: string): Promise<ElectoralActCatalog>;
  register(input: RegisterElectoralActInput): Promise<RegisteredElectoralAct>;
}

export type RegisterElectoralActResult =
  | { ok: true; act: RegisteredElectoralAct }
  | { ok: false; message: string };

export async function registerElectoralAct(
  repository: ElectoralActRepository,
  input: RegisterElectoralActInput,
): Promise<RegisterElectoralActResult> {
  const validation = validateElectoralActForm({
    candidateVotes: input.candidateVotes.map((candidate) => candidate.votes),
    blankVotes: input.blankVotes,
    nullVotes: input.nullVotes,
    totalVotes: input.totalVotes,
    observations: input.observation ?? '',
  });

  if (!validation.isValid) {
    return {
      ok: false,
      message: validation.issues[0]?.message ?? 'Revisa los valores del acta.',
    };
  }

  const candidateIds = input.candidateVotes.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    return {
      ok: false,
      message: 'Una candidatura aparece repetida en el acta.',
    };
  }

  try {
    return { ok: true, act: await repository.register(input) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el acta. Inténtalo nuevamente.',
    };
  }
}
