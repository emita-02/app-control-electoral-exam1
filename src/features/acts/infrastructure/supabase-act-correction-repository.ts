import type {
  ActCorrectionContextData,
  ActCorrectionRecord,
  ActCorrectionRepository,
} from '@/features/acts/domain/act-correction-record';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

type ActRow = {
  id: number;
  registered_by: string;
  electoral_table_id: number;
  position_id: number;
  total_votes: number;
  blank_votes: number;
  null_votes: number;
  observation: string | null;
  electoral_tables: { polling_place_id: number } | null;
};

type CandidateRow = { id: number; full_name: string };
type ResultRow = { candidate_id: number; votes: number };
type AssignmentRow = { electoral_table_id: number };
type CorrectionRow = {
  id: number;
  act_id: number;
  corrected_by: string;
  previous_data: unknown;
  corrected_data: unknown;
  correction_reason: string;
  corrected_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SupabaseActCorrectionRepository implements ActCorrectionRepository {
  async load(actId: number): Promise<ActCorrectionContextData> {
    if (!Number.isSafeInteger(actId) || actId <= 0) {
      throw new Error('El acta indicada no es válida.');
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const actResult = await supabase
      .from('electoral_acts')
      .select(
        'id, registered_by, electoral_table_id, position_id, total_votes, blank_votes, null_votes, observation, electoral_tables ( polling_place_id )',
      )
      .eq('id', actId)
      .maybeSingle<ActRow>();
    if (actResult.error || !actResult.data) {
      throw new Error('No se encontró el acta o no tienes acceso a ella.');
    }
    const act = actResult.data;
    if (!act.electoral_tables) {
      throw new Error('No se pudo determinar el recinto del acta.');
    }

    const [candidatesResult, resultsResult, assignmentsResult, correctionsResult] =
      await Promise.all([
        supabase
          .from('candidates')
          .select('id, full_name')
          .eq('position_id', act.position_id),
        supabase
          .from('act_results')
          .select('candidate_id, votes')
          .eq('act_id', actId),
        supabase
          .from('watcher_assignments')
          .select('electoral_table_id')
          .eq('watcher_id', user.id)
          .is('ended_at', null),
        supabase
          .from('act_corrections')
          .select('id, act_id, corrected_by, previous_data, corrected_data, correction_reason, corrected_at')
          .eq('act_id', actId)
          .order('corrected_at', { ascending: false }),
      ]);

    if (
      candidatesResult.error ||
      resultsResult.error ||
      assignmentsResult.error ||
      correctionsResult.error
    ) {
      throw new Error('No se pudo cargar la información del acta.');
    }

    const candidates = (candidatesResult.data ?? []) as unknown as CandidateRow[];
    const votes = new Map<number, number>(
      ((resultsResult.data ?? []) as unknown as ResultRow[]).map((row) => [
        Number(row.candidate_id),
        Number(row.votes),
      ]),
    );

    const records: ActCorrectionRecord[] = (
      (correctionsResult.data ?? []) as unknown as CorrectionRow[]
    ).map((row) => ({
      id: Number(row.id),
      actId: Number(row.act_id),
      correctedBy: String(row.corrected_by),
      previousData: isRecord(row.previous_data) ? row.previous_data : {},
      correctedData: isRecord(row.corrected_data) ? row.corrected_data : {},
      reason: String(row.correction_reason),
      correctedAt: String(row.corrected_at),
    }));

    return {
      act: {
        reference: String(act.id),
        authorId: String(act.registered_by),
        pollingPlaceId: Number(act.electoral_tables.polling_place_id),
        electoralTableId: Number(act.electoral_table_id),
        currentValues: {
          candidateVotes: candidates.map((candidate) => ({
            candidateReference: String(candidate.id),
            candidateName: String(candidate.full_name),
            votes: votes.get(Number(candidate.id)) ?? 0,
          })),
          blankVotes: Number(act.blank_votes),
          nullVotes: Number(act.null_votes),
          totalVotes: Number(act.total_votes),
          observations: act.observation ?? '',
        },
      },
      assignedTableIds: ((assignmentsResult.data ?? []) as unknown as AssignmentRow[]).map(
        (row) => Number(row.electoral_table_id),
      ),
      records,
    };
  }
}
