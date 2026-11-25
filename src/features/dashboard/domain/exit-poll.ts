export type ExitPollResponseType =
  | 'candidate'
  | 'blank'
  | 'null'
  | 'no_response';

export type RegisterExitPollInput = {
  electoralTableId: number;
  positionId: number;
  candidateId: number | null;
  responseType: ExitPollResponseType;
};

export type RegisteredExitPollResponse = {
  responseId: number;
  createdAt: string;
};

export interface ExitPollRepository {
  register(input: RegisterExitPollInput): Promise<RegisteredExitPollResponse>;
}
