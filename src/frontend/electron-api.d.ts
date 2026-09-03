interface Window {
  readonly valeCompanion?: {
    onAlert(listener: (name: string) => void): () => void;
  };
}
