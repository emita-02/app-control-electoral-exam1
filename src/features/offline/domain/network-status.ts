export interface NetworkStatus {
  isOnline(): Promise<boolean>;
  subscribe(listener: (online: boolean) => void): () => void;
}
