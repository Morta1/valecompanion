export type UpdatePhase = "idle" | "checking" | "available" | "current" | "downloading" | "installing" | "error" | "disabled" | "unavailable";
export interface UpdatePreferences { automaticChecks: boolean; skippedVersion: string | null }
export interface UpdateState extends UpdatePreferences {
  phase: UpdatePhase;
  currentVersion: string;
  version: string | null;
  releaseNotes: string;
  progress: number;
  message: string;
  canInstall: boolean;
  dismissed: boolean;
}
export type UpdateCommand = "check" | "install" | "later" | "skip" | "releases";
export interface UpdateAPI {
  getState(): Promise<UpdateState>;
  command(command: UpdateCommand): Promise<UpdateState>;
  setAutomaticChecks(enabled: boolean): Promise<UpdateState>;
  onState(listener: (state: UpdateState) => void): () => void;
}
