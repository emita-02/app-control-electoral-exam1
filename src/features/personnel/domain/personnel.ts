import type { UserProfile, UserRole } from '@/features/auth/domain/user-profile';
import type { ElectoralTable, PollingPlace } from '@/features/territory/domain/territory';

export type PersonnelMember = {
  id: string;
  fullName: string;
  role: UserRole;
  provinceId: number | null;
  pollingPlaceId: number | null;
  isActive: boolean;
};

export type WatcherAssignment = {
  id: number;
  watcherId: string;
  electoralTableId: number;
  tableNumber: number;
  assignedAt: string;
  endedAt: string | null;
  endedBy: string | null;
  endReason: string | null;
};

export type PersonnelOverview = {
  members: PersonnelMember[];
  assignments: WatcherAssignment[];
  electoralTables: ElectoralTable[];
  pollingPlaces: PollingPlace[];
};

export type CreatePersonnelInput = {
  role: 'coordinador_recinto' | 'veedor';
  fullName: string;
  email: string;
  pollingPlaceId?: number;
};

export type SaveWatcherAssignmentsInput = {
  watcherId: string;
  electoralTableIds: number[];
  replacingWatcherId?: string;
  endReason?: string;
};

export interface PersonnelRepository {
  load(profile: UserProfile): Promise<PersonnelOverview>;
  createMember(input: CreatePersonnelInput): Promise<void>;
  saveAssignments(input: SaveWatcherAssignmentsInput): Promise<void>;
}
