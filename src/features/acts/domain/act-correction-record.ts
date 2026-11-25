import type { ElectoralActCorrectionContext } from '@/features/acts/domain/electoral-act';

export type ActCorrectionRecord = {
  id: number;
  actId: number;
  correctedBy: string;
  previousData: Record<string, unknown>;
  correctedData: Record<string, unknown>;
  reason: string;
  correctedAt: string;
};

export type ActCorrectionContextData = {
  act: ElectoralActCorrectionContext;
  assignedTableIds: number[];
  records: ActCorrectionRecord[];
};

export interface ActCorrectionRepository {
  load(actId: number): Promise<ActCorrectionContextData>;
}
