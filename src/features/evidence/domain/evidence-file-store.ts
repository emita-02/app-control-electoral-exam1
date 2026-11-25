export interface EvidenceFileStore {
  persist(localUri: string): Promise<string>;
}
