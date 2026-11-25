import { userRoles, type UserProfile } from '@/features/auth/domain/user-profile';
import { supabase } from '@/features/auth/infrastructure/supabase-client';
import {
  isApprovedActStatus,
  PENDING_REVIEW_ACT_STATUS,
} from '@/features/dashboard/domain/act-approval';
import { tableBelongsToProvince } from '@/features/dashboard/domain/territory-access';
import type {
  DashboardCandidateResult,
  DashboardExitPollSummary,
  DashboardLocationWarning,
  DashboardPollingPlaceProgress,
  DashboardPositionSummary,
  DashboardRecentAct,
  DashboardRepository,
  DashboardSnapshot,
} from '@/features/dashboard/domain/dashboard';

type TableRow = {
  id: number;
  table_number: number;
  polling_place_id: number;
  polling_places: {
    id: number;
    name: string;
    code: string | null;
    parishes: {
      cantons: {
        province_id: number;
      } | null;
    } | null;
  } | null;
};

type ActRow = {
  id: number;
  electoral_table_id: number;
  position_id: number;
  registered_by: string;
  status: string;
  total_votes: number;
  blank_votes: number;
  null_votes: number;
  observation: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type ResultRow = {
  act_id: number;
  candidate_id: number;
  votes: number;
};

type CandidateRow = {
  id: number;
  position_id: number;
  full_name: string;
  political_organizations: { name: string } | null;
};

type PositionRow = {
  id: number;
  code: string;
  name: string;
};

type EvidenceRow = {
  id: number;
  act_id: number;
  latitude: number | null;
  longitude: number | null;
  captured_at: string;
};

type CorrectionRow = {
  id: number;
  act_id: number;
  correction_reason: string;
  corrected_at: string;
};

type ExitPollRow = {
  id: number;
  electoral_table_id: number;
  position_id: number;
  candidate_id: number | null;
  response_type: string;
  created_at: string;
};

function numberId(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function percentage(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 1000) / 10;
}

function distanceInMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export class SupabaseDashboardRepository implements DashboardRepository {
  constructor(private readonly profile: UserProfile) {}

  async load(): Promise<DashboardSnapshot> {
    const queryErrorMessage =
      'No se pudieron cargar los datos del panel. Verifica tu conexión y permisos.';

    const [tablesResult, actsResult, resultsResult, candidatesResult, positionsResult, evidenceResult, correctionsResult, exitPollResult, assignmentsResult] =
      await Promise.all([
        supabase
          .from('electoral_tables')
          .select('id, table_number, polling_place_id, polling_places ( id, name, code, parishes ( cantons ( province_id ) ) )'),
        supabase
          .from('electoral_acts')
          .select('id, electoral_table_id, position_id, registered_by, status, total_votes, blank_votes, null_votes, observation, reviewed_at, created_at'),
        supabase.from('act_results').select('act_id, candidate_id, votes'),
        supabase
          .from('candidates')
          .select('id, position_id, full_name, political_organizations ( name )'),
        supabase.from('electoral_positions').select('id, code, name'),
        supabase
          .from('act_evidence')
          .select('id, act_id, latitude, longitude, captured_at'),
        supabase
          .from('act_corrections')
          .select('id, act_id, correction_reason, corrected_at'),
        supabase
          .from('exit_poll_responses')
          .select('id, electoral_table_id, position_id, candidate_id, response_type, created_at'),
        this.profile.role === userRoles.observer
          ? supabase
              .from('watcher_assignments')
              .select('electoral_table_id')
              .eq('watcher_id', this.profile.id)
              .is('ended_at', null)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (
      tablesResult.error ||
      actsResult.error ||
      resultsResult.error ||
      candidatesResult.error ||
      positionsResult.error ||
      evidenceResult.error ||
      correctionsResult.error ||
      exitPollResult.error ||
      assignmentsResult.error
    ) {
      throw new Error(queryErrorMessage);
    }

    const allTables = (tablesResult.data ?? []) as unknown as TableRow[];
    const allowedTableIds = new Set<number>();

    if (this.profile.role === userRoles.observer) {
      const assignments = (assignmentsResult.data ?? []) as {
        electoral_table_id: number | string;
      }[];
      for (const assignment of assignments) {
        allowedTableIds.add(numberId(assignment.electoral_table_id));
      }
    } else if (this.profile.role === userRoles.precinctCoordinator) {
      for (const table of allTables) {
        if (table.polling_place_id === this.profile.pollingPlaceId) {
          allowedTableIds.add(numberId(table.id));
        }
      }
    } else {
      for (const table of allTables) {
        if (tableBelongsToProvince(table, this.profile.provinceId)) {
          allowedTableIds.add(numberId(table.id));
        }
      }
    }

    const tablesById = new Map<number, TableRow>();
    for (const table of allTables) {
      tablesById.set(numberId(table.id), table);
    }

    const allActs = (actsResult.data ?? []) as unknown as ActRow[];
    const inScopeActs = allActs.filter((act) =>
      allowedTableIds.has(numberId(act.electoral_table_id)),
    );
    // Los agregados oficiales excluyen borradores y actas pendientes de revisión.
    const acts = inScopeActs.filter((act) => isApprovedActStatus(act.status));
    const actIds = new Set(acts.map((act) => numberId(act.id)));
    const positions = (positionsResult.data ?? []) as unknown as PositionRow[];
    const positionById = new Map(
      positions.map((position) => [numberId(position.id), position]),
    );
    const candidates = (candidatesResult.data ?? []) as unknown as CandidateRow[];
    const candidateById = new Map(
      candidates.map((candidate) => [numberId(candidate.id), candidate]),
    );
    const results = (resultsResult.data ?? []) as unknown as ResultRow[];
    const evidence = (evidenceResult.data ?? []) as unknown as EvidenceRow[];
    const corrections = (correctionsResult.data ?? []) as unknown as CorrectionRow[];
    const exitPolls = (exitPollResult.data ?? []) as unknown as ExitPollRow[];

    const evidenceByAct = new Map<number, EvidenceRow[]>();
    for (const item of evidence) {
      if (!actIds.has(numberId(item.act_id))) {
        continue;
      }
      const list = evidenceByAct.get(numberId(item.act_id)) ?? [];
      list.push(item);
      evidenceByAct.set(numberId(item.act_id), list);
    }

    const positionSummaries = new Map<number, DashboardPositionSummary>();
    for (const position of positions) {
      positionSummaries.set(numberId(position.id), {
        positionId: numberId(position.id),
        positionName: position.name,
        positionCode: position.code,
        reportedActs: 0,
        totalVotes: 0,
        blankVotes: 0,
        nullVotes: 0,
        candidates: [],
        officialCandidates: [],
      });
    }

    for (const candidate of candidates) {
      const summary = positionSummaries.get(numberId(candidate.position_id));
      if (!summary) {
        continue;
      }
      summary.officialCandidates.push({
        candidateId: numberId(candidate.id),
        candidateName: candidate.full_name,
      });
    }
    for (const summary of positionSummaries.values()) {
      summary.officialCandidates.sort((a, b) =>
        a.candidateName.localeCompare(b.candidateName),
      );
    }

    const candidateVotesByPosition = new Map<number, Map<number, number>>();

    for (const act of acts) {
      const summary = positionSummaries.get(numberId(act.position_id));
      if (!summary) {
        continue;
      }
      summary.reportedActs += 1;
      summary.totalVotes += act.total_votes;
      summary.blankVotes += act.blank_votes;
      summary.nullVotes += act.null_votes;
    }

    for (const result of results) {
      if (!actIds.has(numberId(result.act_id))) {
        continue;
      }
      const act = acts.find((item) => numberId(item.id) === numberId(result.act_id));
      if (!act) {
        continue;
      }
      const byCandidate =
        candidateVotesByPosition.get(numberId(act.position_id)) ?? new Map();
      byCandidate.set(
        numberId(result.candidate_id),
        (byCandidate.get(numberId(result.candidate_id)) ?? 0) + result.votes,
      );
      candidateVotesByPosition.set(numberId(act.position_id), byCandidate);
    }

    for (const [positionId, byCandidate] of candidateVotesByPosition) {
      const summary = positionSummaries.get(positionId);
      if (!summary) {
        continue;
      }
      const candidateResults: DashboardCandidateResult[] = [];
      for (const [candidateId, votes] of byCandidate) {
        const candidate = candidateById.get(candidateId);
        candidateResults.push({
          candidateId,
          candidateName: candidate?.full_name ?? `Candidatura ${candidateId}`,
          organization:
            candidate?.political_organizations?.name ?? 'Organización no identificada',
          votes,
          percentage: percentage(votes, summary.totalVotes),
        });
      }
      summary.candidates = candidateResults.sort((a, b) => b.votes - a.votes);
    }

    const pollingPlaceProgress = new Map<number, DashboardPollingPlaceProgress>();
    for (const table of allTables) {
      const tableId = numberId(table.id);
      if (!allowedTableIds.has(tableId)) {
        continue;
      }
      const pollingPlaceId = numberId(table.polling_place_id);
      const progress = pollingPlaceProgress.get(pollingPlaceId) ?? {
        pollingPlaceId,
        pollingPlaceName:
          table.polling_places?.name ?? `Recinto ${pollingPlaceId}`,
        totalTables: 0,
        reportedTables: 0,
        reportedActs: 0,
      };
      progress.totalTables += 1;
      pollingPlaceProgress.set(pollingPlaceId, progress);
    }
    const reportedTableIds = new Set<number>();
    for (const act of acts) {
      const tableId = numberId(act.electoral_table_id);
      const pollingPlaceId = numberId(tablesById.get(tableId)?.polling_place_id ?? -1);
      const progress = pollingPlaceProgress.get(pollingPlaceId);
      if (progress) {
        progress.reportedActs += 1;
      }
      reportedTableIds.add(tableId);
    }
    for (const tableId of reportedTableIds) {
      const pollingPlaceId = numberId(tablesById.get(tableId)?.polling_place_id ?? -1);
      const progress = pollingPlaceProgress.get(pollingPlaceId);
      if (progress) {
        progress.reportedTables += 1;
      }
    }

    const recentActs: DashboardRecentAct[] = [...acts]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8)
      .map((act) => {
        const table = tablesById.get(numberId(act.electoral_table_id));
        const actEvidence = evidenceByAct.get(numberId(act.id)) ?? [];
        return {
          actId: numberId(act.id),
          tableNumber: numberId(table?.table_number ?? 0),
          pollingPlaceName: table?.polling_places?.name ?? 'Recinto no identificado',
          positionName:
            positionById.get(numberId(act.position_id))?.name ?? 'Dignidad no identificada',
          status: act.status,
          reviewedAt: act.reviewed_at,
          evidenceCount: actEvidence.length,
          latitude: actEvidence[0]?.latitude ?? null,
          longitude: actEvidence[0]?.longitude ?? null,
        };
      });

    const exitPollByPosition = new Map<number, DashboardExitPollSummary>();
    for (const position of positions) {
      exitPollByPosition.set(numberId(position.id), {
        positionId: numberId(position.id),
        positionName: position.name,
        totalResponses: 0,
        candidateResponses: [],
        blankResponses: 0,
        nullResponses: 0,
        noResponses: 0,
      });
    }
    const exitPollVotes = new Map<number, Map<number, number>>();
    for (const response of exitPolls) {
      if (!allowedTableIds.has(numberId(response.electoral_table_id))) {
        continue;
      }
      const summary = exitPollByPosition.get(numberId(response.position_id));
      if (!summary) {
        continue;
      }
      summary.totalResponses += 1;
      if (response.response_type === 'blank') {
        summary.blankResponses += 1;
      } else if (response.response_type === 'null') {
        summary.nullResponses += 1;
      } else if (response.response_type === 'no_response') {
        summary.noResponses += 1;
      } else if (response.candidate_id !== null) {
        const byCandidate =
          exitPollVotes.get(numberId(response.position_id)) ?? new Map();
        const candidateId = numberId(response.candidate_id);
        byCandidate.set(candidateId, (byCandidate.get(candidateId) ?? 0) + 1);
        exitPollVotes.set(numberId(response.position_id), byCandidate);
      }
    }
    for (const [positionId, byCandidate] of exitPollVotes) {
      const summary = exitPollByPosition.get(positionId);
      if (!summary) {
        continue;
      }
      summary.candidateResponses = [...byCandidate]
        .map(([candidateId, votes]) => {
          const candidate = candidateById.get(candidateId);
          return {
            candidateId,
            candidateName: candidate?.full_name ?? `Candidatura ${candidateId}`,
            organization:
              candidate?.political_organizations?.name ?? 'Organización no identificada',
            votes,
            percentage: percentage(votes, summary.totalResponses),
          };
        })
        .sort((a, b) => b.votes - a.votes);
    }

    const evidencePoints: { actId: number; tableNumber: number; latitude: number; longitude: number }[] = [];
    for (const [actId, actEvidence] of evidenceByAct) {
      const point = actEvidence.find(
        (item) => item.latitude !== null && item.longitude !== null,
      );
      if (!point || point.latitude === null || point.longitude === null) {
        continue;
      }
      const act = acts.find((item) => numberId(item.id) === actId);
      if (!act) {
        continue;
      }
      const table = tablesById.get(numberId(act.electoral_table_id));
      evidencePoints.push({
        actId,
        tableNumber: numberId(table?.table_number ?? 0),
        latitude: point.latitude,
        longitude: point.longitude,
      });
    }

    const locationWarnings: DashboardLocationWarning[] = [];
    if (evidencePoints.length >= 3) {
      const centerLatitude =
        evidencePoints.reduce((sum, point) => sum + point.latitude, 0) /
        evidencePoints.length;
      const centerLongitude =
        evidencePoints.reduce((sum, point) => sum + point.longitude, 0) /
        evidencePoints.length;
      for (const point of evidencePoints) {
        const distance = distanceInMeters(
          centerLatitude,
          centerLongitude,
          point.latitude,
          point.longitude,
        );
        if (distance > 1_000) {
          locationWarnings.push({
            actId: point.actId,
            tableNumber: point.tableNumber,
            distanceMeters: Math.round(distance),
          });
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      totalTables: allowedTableIds.size,
      reportedTables: reportedTableIds.size,
      pendingActs: inScopeActs.filter(
        (act) => act.status === PENDING_REVIEW_ACT_STATUS,
      ).length,
      approvedActs: acts.length,
      evidenceCount: evidence.filter((item) => actIds.has(numberId(item.act_id))).length,
      correctionsCount: corrections.filter((item) => actIds.has(numberId(item.act_id))).length,
      positions: [...positionSummaries.values()],
      tables: [...allowedTableIds].map((tableId) => {
        const table = tablesById.get(tableId);
        return {
          id: tableId,
          tableNumber: numberId(table?.table_number ?? 0),
          pollingPlaceName: table?.polling_places?.name ?? `Recinto ${numberId(table?.polling_place_id ?? 0)}`,
        };
      }),
      pollingPlaces: [...pollingPlaceProgress.values()].sort((a, b) =>
        a.pollingPlaceName.localeCompare(b.pollingPlaceName),
      ),
      recentActs,
      exitPolls: [...exitPollByPosition.values()],
      locationWarnings,
    };
  }
}
