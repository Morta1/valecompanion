import type { AppUpdater } from "electron-updater";
import type { UpdatePreferences, UpdateState } from "../shared/updates.ts";
import { describeUpdateError, UpdateUserError } from "./update-errors.ts";

type Updater = Pick<AppUpdater, "autoDownload" | "autoInstallOnAppQuit" | "allowPrerelease" | "allowDowngrade" | "disableWebInstaller" | "on" | "checkForUpdates" | "downloadUpdate" | "quitAndInstall">;

export class UpdateController {
  state: UpdateState;
  private busy = false;
  private stopped = false;
  private ready = false;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly updater: Updater, private readonly options: {
    version: string;
    preferences: UpdatePreferences;
    canInstall: boolean;
    enabled: boolean;
    publish(state: UpdateState): void;
    save(preferences: UpdatePreferences): void;
    prepareInstall(): Promise<void>;
    recover(): Promise<void>;
    preflight(): Promise<void>;
    reportError(error: unknown): void;
  }) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    this.state = {
      ...options.preferences, currentVersion: options.version, canInstall: options.canInstall,
      phase: options.enabled ? "idle" : "disabled", version: null, releaseNotes: "", progress: 0,
      message: options.enabled ? "Updates install only when you choose Update and restart." : "Updates are disabled in development and smoke tests.",
      dismissed: false,
    };
    updater.on("error", (error) => this.fail(error));
    updater.on("download-progress", ({ percent }) => {
      if (this.state.phase === "downloading") this.patch({ progress: Math.max(0, Math.min(100, percent)) });
    });
  }

  start(): void {
    if (!this.options.enabled) return;
    this.startupTimer = setTimeout(() => void this.check(false), 15_000);
    this.interval = setInterval(() => void this.check(false), 6 * 60 * 60 * 1_000);
    this.startupTimer.unref();
    this.interval.unref();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.startupTimer);
    clearInterval(this.interval);
  }

  async check(manual = true): Promise<void> {
    if (this.stopped || this.busy || !this.options.enabled || (!manual && !this.state.automaticChecks)) return;
    // Keep the cached installer paired with the version the user saw.
    if (!manual && this.ready) return;
    const previousVersion = this.state.version;
    const previouslyDismissed = this.state.dismissed;
    this.busy = true;
    this.ready = false;
    this.patch({ phase: "checking", message: "Checking for updates…", version: null, releaseNotes: "", progress: 0 });
    try {
      const result = await this.updater.checkForUpdates();
      if (this.stopped) return;
      if (!result) throw new Error("Update checking is unavailable for this build.");
      // The provider applies semver, platform compatibility and stable-channel policy.
      if (result.isUpdateAvailable) {
        const info = result.updateInfo;
        const notes = typeof info.releaseNotes === "string" ? info.releaseNotes : (info.releaseNotes ?? []).map((note) => note.note ?? "").join("\n\n");
        this.patch({ phase: "available", version: info.version, releaseNotes: notes.slice(0, 30_000),
          dismissed: !manual && (this.state.skippedVersion === info.version || (previousVersion === info.version && previouslyDismissed)),
          message: this.state.canInstall ? `Version ${info.version} is available.` : `Version ${info.version} is available. Portable Windows builds require manual replacement.` });
      } else this.patch({ phase: "current", message: "You’re up to date.", dismissed: false });
    } catch (error) { this.fail(error); }
    finally { this.busy = false; }
  }

  async install(): Promise<void> {
    if (this.stopped || this.busy || !this.options.enabled || !this.state.canInstall || !this.state.version || !["available", "error"].includes(this.state.phase)) return;
    this.busy = true;
    let prepared = false;
    try {
      await this.options.preflight();
      if (!this.ready) {
        this.patch({ phase: "downloading", progress: 0, message: "Downloading update. Vale Companion will restart when ready." });
        const files = await this.updater.downloadUpdate();
        if (!files.length) throw new Error("The update download did not produce an installer.");
        this.ready = true;
      }
      if (this.stopped) return;
      this.patch({ phase: "installing", progress: 100, message: "Saving your session and installing…" });
      prepared = true;
      await this.options.prepareInstall();
      if (this.stopped) return;
      this.updater.quitAndInstall(false, true);
      // The updater reports synchronous installation failures through its error event.
      if (this.state.phase === "error") throw new UpdateUserError(this.state.message);
    } catch (error) {
      this.fail(error);
      if (prepared && !this.stopped) {
        try { await this.options.recover(); }
        catch { this.patch({ message: `${this.state.message} Please restart Vale Companion to resume capture.` }); }
      }
    } finally { this.busy = false; }
  }

  setAutomaticChecks(automaticChecks: boolean): void {
    this.options.save({ automaticChecks, skippedVersion: this.state.skippedVersion });
    this.patch({ automaticChecks });
  }

  dismiss(skip: boolean): void {
    if (this.busy) return;
    if (skip && this.state.version) {
      this.options.save({ automaticChecks: this.state.automaticChecks, skippedVersion: this.state.version });
      this.patch({ skippedVersion: this.state.version });
    }
    this.patch({ dismissed: true });
  }

  private fail(error: unknown): void {
    if (this.stopped) return;
    this.options.reportError(error);
    this.patch(describeUpdateError(error));
  }

  private patch(update: Partial<UpdateState>): void {
    this.state = { ...this.state, ...update };
    this.options.publish(this.state);
  }
}
