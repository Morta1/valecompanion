import { contextBridge, ipcRenderer } from "electron";
import type { UpdateAPI, UpdateState } from "../shared/updates.ts";

contextBridge.exposeInMainWorld("valeCompanion", {
  updates: {
    getState: () => ipcRenderer.invoke("valeCompanion:updates", "state"),
    command: (command) => ipcRenderer.invoke("valeCompanion:updates", command),
    setAutomaticChecks: (enabled) => ipcRenderer.invoke("valeCompanion:updates", "automatic", enabled),
    onState(listener) {
      const handler = (_event: Electron.IpcRendererEvent, state: UpdateState) => listener(state);
      ipcRenderer.on("valeCompanion:update-state", handler);
      return () => ipcRenderer.removeListener("valeCompanion:update-state", handler);
    },
  } satisfies UpdateAPI,
  onAlert(listener: (name: string) => void) {
    const handler = (_event: Electron.IpcRendererEvent, name: unknown) => {
      if (typeof name === "string") listener(name);
    };
    ipcRenderer.on("valeCompanion:play-sound", handler);
    return () => { ipcRenderer.removeListener("valeCompanion:play-sound", handler); };
  },
});
