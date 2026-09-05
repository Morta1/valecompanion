import { constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { app, ipcMain, shell, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import { UpdateController } from "./update-controller.ts";
import type { UpdatePreferences } from "../shared/updates.ts";
import { createDiagnosticLogger, formatError } from "../shared/diagnostics.ts";
import { UpdateUserError } from "./update-errors.ts";

export function setupUpdates(options: {
  data: string;
  window(): BrowserWindow | undefined;
  smokeTest: boolean;
  prepareInstall(): Promise<void>;
  recover(): Promise<void>;
}): UpdateController {
  const preferencesPath = path.join(options.data, "updates.json");
  let preferences: UpdatePreferences = { automaticChecks: true, skippedVersion: null };
  try {
    const saved = JSON.parse(readFileSync(preferencesPath, "utf8"));
    preferences = { automaticChecks: saved.automaticChecks !== false, skippedVersion: typeof saved.skippedVersion === "string" ? saved.skippedVersion : null };
  } catch { /* Missing or damaged preferences use safe defaults: checks only. */ }
  const { autoUpdater } = electronUpdater;
  const diagnostics = createDiagnosticLogger("updates", path.join(options.data, "logs", "updates.log"));
  const portableWindows = process.platform === "win32" && Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
  const packageTypePath = path.join(process.resourcesPath, "package-type");
  const packageType = existsSync(packageTypePath) ? readFileSync(packageTypePath, "utf8").trim() : "";
  const supported = process.platform === "win32" || (process.platform === "linux" && (Boolean(process.env.APPIMAGE) || ["deb", "rpm"].includes(packageType)));
  const controller = new UpdateController(autoUpdater, {
    version: app.getVersion(), preferences, canInstall: supported && !portableWindows,
    enabled: app.isPackaged && !options.smokeTest && supported,
    reportError(error) { diagnostics.warn("Update operation failed", { error: formatError(error) }); },
    publish(state) {
      const window = options.window();
      if (window && !window.isDestroyed()) window.webContents.send("valeCompanion:update-state", state);
    },
    save(value) {
      mkdirSync(options.data, { recursive: true });
      writeFileSync(`${preferencesPath}.tmp`, JSON.stringify(value, null, 2));
      renameSync(`${preferencesPath}.tmp`, preferencesPath);
    },
    prepareInstall: options.prepareInstall,
    recover: options.recover,
    async preflight() {
      if (process.env.APPIMAGE) {
        try {
          await access(process.env.APPIMAGE, constants.W_OK);
          await access(path.dirname(process.env.APPIMAGE), constants.W_OK);
        } catch { throw new UpdateUserError("Move the AppImage into a folder you own before updating, or download the new release manually."); }
      }
    },
  });
  ipcMain.handle("valeCompanion:updates", async (event, command: unknown, value: unknown) => {
    const window = options.window();
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error("Update requests must come from the application’s main window.");
    }
    switch (command) {
      case "state": break;
      case "check": await controller.check(); break;
      case "install": void controller.install(); break;
      case "later": controller.dismiss(false); break;
      case "skip": controller.dismiss(true); break;
      case "automatic":
        if (typeof value !== "boolean") throw new Error("Invalid update preference.");
        controller.setAutomaticChecks(value);
        break;
      case "releases": await shell.openExternal("https://github.com/bjb2/valecompanion/releases/latest"); break;
      default: throw new Error("Unknown update command.");
    }
    return controller.state;
  });
  controller.start();
  return controller;
}
