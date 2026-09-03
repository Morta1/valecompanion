import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("valeCompanion", {
  onAlert(listener: (name: string) => void) {
    const handler = (_event: Electron.IpcRendererEvent, name: unknown) => {
      if (typeof name === "string") listener(name);
    };
    ipcRenderer.on("valeCompanion:play-sound", handler);
    return () => { ipcRenderer.removeListener("valeCompanion:play-sound", handler); };
  },
});
