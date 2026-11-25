export type ConfirmedCandidateVote = {
  candidateId: number;
  votes: number;
};

export type ConfirmActInput = {
  action: 'confirm_ocr' | 'apply_correction';
  actId: number;
  candidateVotes: ConfirmedCandidateVote[];
  blankVotes: number;
  nullVotes: number;
  totalVotes: number;
  observation: string | null;
  reason: string;
  ocrData?: Record<string, unknown> | null;
};

export type ConfirmActResult = {
  actId: number;
  status: string;
  reviewedAt: string;
  correctionRegistered: boolean;
};

export interface ActConfirmationRepository {
  confirm(input: ConfirmActInput): Promise<ConfirmActResult>;
}
