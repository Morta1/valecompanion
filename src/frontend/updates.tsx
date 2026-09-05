import { useEffect, useState } from "preact/hooks";
import type { UpdateCommand, UpdateState } from "../shared/updates.ts";

export function useUpdates() {
  const [state, setState] = useState<UpdateState>();
  const [error, setError] = useState("");
  useEffect(() => {
    const api = window.valeCompanion?.updates;
    if (!api) return;
    let active = true;
    const unsubscribe = api.onState((state) => { if (active) setState(state); });
    void api.getState().then((state) => { if (active) setState(state); }).catch(() => { if (active) setError("Update status could not be loaded. Please restart Vale Companion."); });
    return () => { active = false; unsubscribe(); };
  }, []);
  const command = async (command: UpdateCommand) => {
    setError("");
    try {
      const state = await window.valeCompanion?.updates.command(command);
      if (state) setState(state);
    } catch { setError("That update action could not be completed. Please try again."); }
  };
  const automatic = async (enabled: boolean) => {
    setError("");
    try {
      const state = await window.valeCompanion?.updates.setAutomaticChecks(enabled);
      if (state) setState(state);
    } catch { setError("Your update preference could not be saved. Please try again."); }
  };
  return { state, error, command, automatic };
}

export type UpdatesModel = ReturnType<typeof useUpdates>;

export function UpdateSettings({ updates }: { updates: UpdatesModel }) {
  const { state, error, command, automatic } = updates;
  if (!state) return null;
  const busy = ["checking", "downloading", "installing"].includes(state.phase);
  return <section>
    <div class="settings-heading"><span>Updates</span><button type="button" disabled={busy || state.phase === "disabled"} onClick={() => void command("check")}>Check for updates</button></div>
    <label class="switch-row"><span><strong>Check automatically</strong><small>Check at startup and every six hours. Downloads and installation require your click.</small></span><input type="checkbox" role="switch" checked={state.automaticChecks} disabled={state.phase === "disabled"} onChange={(event) => void automatic(event.currentTarget.checked)} /></label>
    <div class="settings-copy" aria-live="polite"><strong>Installed version {state.currentVersion}</strong><p>{state.message}</p></div>
    {state.phase === "downloading" && <progress class="update-progress" max={100} value={state.progress} aria-label="Update download progress" />}
    {error && <div class="settings-error" role="alert">{error}</div>}
    {state.phase === "error" && <p class="settings-copy">Retry the update or download it from GitHub Releases.</p>}
    {state.version && <div class="update-actions">
      {state.canInstall && <button type="button" disabled={busy} onClick={() => void command("install")}>Update and restart</button>}
      <button type="button" disabled={busy} onClick={() => void command("skip")}>Skip this version</button>
    </div>}
    <div class="update-actions"><button type="button" onClick={() => void command("releases")}>Open GitHub Releases</button></div>
    {state.canInstall && state.version && <p class="settings-copy">Capture pauses during installation. Native Linux packages may ask for your system password.</p>}
    {state.releaseNotes && <details class="update-notes"><summary>Release notes for {state.version}</summary><pre>{state.releaseNotes}</pre></details>}
  </section>;
}

export function UpdateNotice({ updates, onDetails }: { updates: UpdatesModel; onDetails(): void }) {
  const state = updates.state;
  if (!state || state.dismissed || !state.version || !["available", "downloading", "installing", "error"].includes(state.phase)) return null;
  const busy = state.phase === "downloading" || state.phase === "installing";
  return <aside class="update-notice" aria-label="Application update" aria-live="polite">
    <span>{state.phase === "downloading" ? `Downloading update · ${Math.round(state.progress)}%` : state.phase === "installing" ? "Saving and installing…" : state.phase === "error" ? "Update needs attention" : `Version ${state.version} available`}</span>
    <button type="button" onClick={onDetails}>Details</button>
    {!busy && <><button type="button" onClick={() => void updates.command(state.canInstall ? "install" : "releases")}>{state.canInstall ? "Update and restart" : "Download"}</button><button type="button" onClick={() => void updates.command("later")}>Later</button></>}
  </aside>;
}
