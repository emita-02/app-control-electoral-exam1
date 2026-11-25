import type {
  ElectoralActCatalog,
  ElectoralActCandidate,
  ElectoralActPosition,
  ElectoralActRepository,
  RegisteredElectoralAct,
  RegisterElectoralActInput,
} from '@/features/acts/domain/electoral-act-registration';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

type RpcError = {
  code?: string | null;
  message?: string | null;
};

const ALLOWED_POSITION_CODES = ['alcaldia', 'prefectura'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value;
}

function readInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(message);
  }
  return value;
}

function readString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}

function readNullableString(value: unknown, message: string): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}

function rpcErrorMessage(error: RpcError): string {
  if (error.code === '23505') {
    return 'Ya existe un acta registrada para esta mesa y dignidad.';
  }
  if (error.code === '23514') {
    return (
      error.message ??
      'La suma de votos por candidato, blancos y nulos debe coincidir con el total.'
    );
  }
  if (typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message;
  }
  return 'No se pudo guardar el acta. Verifica tu conexión e inténtalo nuevamente.';
}

function parseRegisteredAct(value: unknown): RegisteredElectoralAct {
  const record = readRecord(
    value,
    'El servidor no confirmó el acta registrada.',
  );
  const message = 'El servidor devolvió un acta con datos inesperados.';

  return {
    id: readInteger(record.act_id, message),
    electoralTableId: readInteger(record.electoral_table_id, message),
    positionId: readInteger(record.position_id, message),
    status: readString(record.status, message),
    totalVotes: readInteger(record.total_votes, message),
    blankVotes: readInteger(record.blank_votes, message),
    nullVotes: readInteger(record.null_votes, message),
    observation: readNullableString(record.observation, message),
    registeredBy: readString(record.registered_by, message),
    createdAt: readString(record.created_at, message),
  };
}

export class SupabaseElectoralActRepository implements ElectoralActRepository {
  async loadCatalog(watcherId: string): Promise<ElectoralActCatalog> {
    const catalogErrorMessage =
      'No se pudieron cargar las mesas, dignidades o candidaturas. Verifica tu conexión y permisos.';

    const [assignmentsResult, positionsResult, candidatesResult] =
      await Promise.all([
        supabase
          .from('watcher_assignments')
          .select(
            'electoral_table_id, electoral_tables ( id, table_number, polling_places ( name, code ) )',
          )
          .eq('watcher_id', watcherId)
          .is('ended_at', null),
        supabase
          .from('electoral_positions')
          .select('id, code, name')
          .in('code', [...ALLOWED_POSITION_CODES]),
        supabase
          .from('candidates')
          .select(
            'id, position_id, full_name, political_organizations ( name )',
          ),
      ]);

    if (
      assignmentsResult.error ||
      positionsResult.error ||
      candidatesResult.error
    ) {
      throw new Error(catalogErrorMessage);
    }

    const tablesById = new Map<number, ElectoralActCatalog['tables'][number]>();

    for (const row of assignmentsResult.data ?? []) {
      const assignment = readRecord(row, catalogErrorMessage);
      const table = readRecord(
        assignment.electoral_tables,
        catalogErrorMessage,
      );
      const pollingPlace = readRecord(
        table.polling_places,
        catalogErrorMessage,
      );
      const tableId = readInteger(table.id, catalogErrorMessage);

      if (!tablesById.has(tableId)) {
        tablesById.set(tableId, {
          id: tableId,
          tableNumber: readInteger(table.table_number, catalogErrorMessage),
          pollingPlaceName: readString(pollingPlace.name, catalogErrorMessage),
          pollingPlaceCode: readNullableString(
            pollingPlace.code,
            catalogErrorMessage,
          ),
        });
      }
    }

    const positions: ElectoralActPosition[] = (positionsResult.data ?? []).map(
      (row) => {
        const position = readRecord(row, catalogErrorMessage);
        return {
          id: readInteger(position.id, catalogErrorMessage),
          code: readString(position.code, catalogErrorMessage),
          name: readString(position.name, catalogErrorMessage),
        };
      },
    );

    const candidates: ElectoralActCandidate[] = (
      candidatesResult.data ?? []
    ).map((row) => {
      const candidate = readRecord(row, catalogErrorMessage);
      const organization = readRecord(
        candidate.political_organizations,
        catalogErrorMessage,
      );
      return {
        id: readInteger(candidate.id, catalogErrorMessage),
        positionId: readInteger(candidate.position_id, catalogErrorMessage),
        fullName: readString(candidate.full_name, catalogErrorMessage),
        organizationName: readString(organization.name, catalogErrorMessage),
      };
    });

    return {
      tables: [...tablesById.values()].sort((a, b) => a.id - b.id),
      positions: positions.sort((a, b) => a.id - b.id),
      candidates: candidates.sort((a, b) => a.id - b.id),
    };
  }

  async register(
    input: RegisterElectoralActInput,
  ): Promise<RegisteredElectoralAct> {
    const { data, error } = await supabase.rpc('registrar_acta_electoral', {
      p_electoral_table_id: input.electoralTableId,
      p_position_id: input.positionId,
      p_candidate_votes: input.candidateVotes.map((candidate) => ({
        candidate_id: candidate.candidateId,
        votes: candidate.votes,
      })),
      p_blank_votes: input.blankVotes,
      p_null_votes: input.nullVotes,
      p_total_votes: input.totalVotes,
      p_observation: input.observation,
    });

    if (error) {
      throw new Error(rpcErrorMessage(error as RpcError));
    }

    return parseRegisteredAct(data);
  }
}
