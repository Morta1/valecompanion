interface Window {
  readonly valeCompanion?: {
    updates: import("../shared/updates.ts").UpdateAPI;
    onAlert(listener: (name: string) => void): () => void;
  };
}
