export type DashboardCandidateResult = {
  candidateId: number;
  candidateName: string;
  organization: string;
  votes: number;
  percentage: number;
};

export type DashboardOfficialCandidate = {
  candidateId: number;
  candidateName: string;
};

export type DashboardPositionSummary = {
  positionId: number;
  positionName: string;
  positionCode: string;
  reportedActs: number;
  totalVotes: number;
  blankVotes: number;
  nullVotes: number;
  candidates: DashboardCandidateResult[];
  officialCandidates: DashboardOfficialCandidate[];
};

export type DashboardTableOption = {
  id: number;
  tableNumber: number;
  pollingPlaceName: string;
};

export type DashboardPollingPlaceProgress = {
  pollingPlaceId: number;
  pollingPlaceName: string;
  totalTables: number;
  reportedTables: number;
  reportedActs: number;
};

export type DashboardRecentAct = {
  actId: number;
  tableNumber: number;
  pollingPlaceName: string;
  positionName: string;
  status: string;
  reviewedAt: string | null;
  evidenceCount: number;
  latitude: number | null;
  longitude: number | null;
};

export type DashboardExitPollSummary = {
  positionId: number;
  positionName: string;
  totalResponses: number;
  candidateResponses: DashboardCandidateResult[];
  blankResponses: number;
  nullResponses: number;
  noResponses: number;
};

export type DashboardLocationWarning = {
  actId: number;
  tableNumber: number;
  distanceMeters: number;
};

export type DashboardSnapshot = {
  generatedAt: string;
  totalTables: number;
  reportedTables: number;
  pendingActs: number;
  approvedActs: number;
  evidenceCount: number;
  correctionsCount: number;
  positions: DashboardPositionSummary[];
  tables: DashboardTableOption[];
  pollingPlaces: DashboardPollingPlaceProgress[];
  recentActs: DashboardRecentAct[];
  exitPolls: DashboardExitPollSummary[];
  locationWarnings: DashboardLocationWarning[];
};

export interface DashboardRepository {
  load(): Promise<DashboardSnapshot>;
}
