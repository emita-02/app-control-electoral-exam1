export type EvidenceUploadInput = {
  actId: number;
  localUri: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
};

export type UploadedEvidence = {
  actId: number;
  evidenceId: number;
  storagePath: string;
};

export interface EvidenceRepository {
  upload(input: EvidenceUploadInput): Promise<UploadedEvidence>;
}
