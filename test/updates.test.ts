import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { UpdateController } from "../src/electron/update-controller.ts";
import type { UpdatePreferences } from "../src/shared/updates.ts";

function harness(overrides: { canInstall?: boolean; automaticChecks?: boolean; enabled?: boolean } = {}) {
  const events = new EventEmitter();
  const calls: string[] = [];
  const errors: unknown[] = [];
  let saved: UpdatePreferences | undefined;
  const updater = Object.assign(events, {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true, disableWebInstaller: false,
    async checkForUpdates() {
      calls.push("check");
      return { isUpdateAvailable: true, updateInfo: { version: "0.2.0", releaseNotes: "Changes" } };
    },
    async downloadUpdate() { calls.push("download"); return ["verified-installer.exe"]; },
    quitAndInstall() { calls.push("install"); },
  });
  const options = {
    version: "0.1.3", preferences: { automaticChecks: overrides.automaticChecks ?? true, skippedVersion: null },
    canInstall: overrides.canInstall ?? true, enabled: overrides.enabled ?? true,
    publish() {}, save(value: UpdatePreferences) { saved = value; },
    async preflight() { calls.push("preflight"); },
    async prepareInstall() { calls.push("save-and-stop"); },
    async recover() { calls.push("recover"); },
    reportError(error: unknown) { errors.push(error); },
  };
  const controller = new UpdateController(updater as unknown as ConstructorParameters<typeof UpdateController>[0], options);
  return { controller, updater, calls, options, errors, saved: () => saved };
}

test("checking never downloads or installs, and all automatic installation is disabled", async () => {
  const { controller, updater, calls } = harness();
  await controller.check();
  expect(calls).toEqual(["check"]);
  expect(updater.autoDownload).toBe(false);
  expect(updater.autoInstallOnAppQuit).toBe(false);
  expect(updater.allowPrerelease).toBe(false);
  expect(updater.allowDowngrade).toBe(false);
  expect(updater.disableWebInstaller).toBe(true);
  expect(controller.state.phase).toBe("available");
});

test("one explicit click downloads then saves before installation; duplicate clicks are ignored", async () => {
  const { controller, calls } = harness();
  await controller.check();
  await Promise.all([controller.install(), controller.install()]);
  expect(calls).toEqual(["check", "preflight", "download", "save-and-stop", "install"]);
});

test("failed downloads never stop capture or install and can be retried", async () => {
  const { controller, updater, calls } = harness();
  await controller.check();
  const download = updater.downloadUpdate;
  updater.downloadUpdate = async () => { throw new Error("Checksum mismatch"); };
  await controller.install();
  expect(controller.state.message).toBe("The update could not be verified and was not installed. Try downloading it again.");
  expect(calls).not.toContain("save-and-stop");
  expect(calls).not.toContain("install");
  updater.downloadUpdate = download;
  await controller.install();
  expect(calls).toContain("install");
});

test("normal quit during a download revokes installation consent", async () => {
  const { controller, updater, calls } = harness();
  await controller.check();
  updater.downloadUpdate = async () => { controller.stop(); return ["installer.exe"]; };
  await controller.install();
  expect(calls).not.toContain("save-and-stop");
  expect(calls).not.toContain("install");
});

test("save failures cancel installation and recover the collector", async () => {
  const { controller, options, calls } = harness();
  await controller.check();
  options.prepareInstall = async () => { throw new Error("Cannot save"); };
  await controller.install();
  expect(controller.state.phase).toBe("error");
  expect(calls).not.toContain("install");
  expect(calls).toContain("recover");
});

test("installer error events restore the collector without a surprise retry", async () => {
  const { controller, updater, calls } = harness();
  await controller.check();
  updater.quitAndInstall = () => { updater.emit("error", new Error("Authorization cancelled")); };
  await controller.install();
  expect(controller.state.phase).toBe("error");
  expect(calls).toContain("recover");
  expect(updater.autoInstallOnAppQuit).toBe(false);
});

test("background checks respect preferences while manual checks remain available", async () => {
  const { controller, calls, saved } = harness({ automaticChecks: false });
  await controller.check(false);
  expect(calls).toEqual([]);
  await controller.check(true);
  expect(calls).toEqual(["check"]);
  controller.setAutomaticChecks(true);
  expect(saved()?.automaticChecks).toBe(true);
});

test("skipped versions stay quiet but remain accessible through manual checks", async () => {
  const { controller, saved } = harness();
  await controller.check();
  controller.dismiss(true);
  expect(saved()?.skippedVersion).toBe("0.2.0");
  await controller.check(false);
  expect(controller.state.dismissed).toBe(true);
  await controller.check(true);
  expect(controller.state.dismissed).toBe(false);
});

test("portable builds can check but cannot run an installer", async () => {
  const { controller, calls } = harness({ canInstall: false });
  await controller.check();
  await controller.install();
  expect(calls).toEqual(["check"]);
});

test("development and smoke tests never check or install", async () => {
  const { controller, calls } = harness({ enabled: false });
  await controller.check();
  await controller.install();
  expect(calls).toEqual([]);
  expect(controller.state.phase).toBe("disabled");
});

test("an up-to-date response cannot be installed", async () => {
  const { controller, updater, calls } = harness();
  updater.checkForUpdates = async () => ({ isUpdateAvailable: false, updateInfo: { version: "0.1.3", releaseNotes: "" } });
  await controller.check();
  await controller.install();
  expect(controller.state.phase).toBe("current");
  expect(calls).not.toContain("install");
});

test("read-only AppImages fail before downloading or stopping capture", async () => {
  const { controller, options, calls } = harness();
  options.preflight = async () => { throw new Error("Read-only AppImage"); };
  await controller.check();
  await controller.install();
  expect(controller.state.phase).toBe("error");
  expect(calls).toEqual(["check"]);
});

test("legacy release missing metadata gets a friendly unavailable status and remains retryable", async () => {
  const { controller, updater, calls, errors } = harness();
  const check = updater.checkForUpdates;
  const error = Object.assign(new Error('Cannot find latest.yml: HttpError: 404 authentication token Headers: secret-detail at C:\\app.asar'), { code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" });
  updater.checkForUpdates = async () => { updater.emit("error", error); throw error; };
  await controller.check();
  expect(controller.state.phase).toBe("unavailable");
  expect(controller.state.message).toContain("not available for the latest release yet");
  expect(controller.state.message).not.toMatch(/token|Headers|app\.asar|secret-detail/);
  expect(controller.state.version).toBeNull();
  expect(errors).toContain(error);
  await controller.install();
  expect(calls).not.toContain("install");
  updater.checkForUpdates = check;
  await controller.check();
  expect(controller.state.phase).toBe("available");
});

test("other 404 errors stay failures without leaking technical details", async () => {
  const { controller, updater, errors } = harness();
  const error = new Error('HttpError: 404 authentication token Headers: secret-detail');
  updater.checkForUpdates = async () => { throw error; };
  await controller.check();
  expect(controller.state.phase).toBe("error");
  expect(controller.state.message).not.toMatch(/404|token|Headers|secret-detail/);
  expect(errors).toContain(error);
});

test("network failures give connection guidance", async () => {
  const { controller, updater } = harness();
  updater.checkForUpdates = async () => { throw new Error("net::ERR_INTERNET_DISCONNECTED private request details"); };
  await controller.check();
  expect(controller.state.message).toContain("Check your internet connection");
  expect(controller.state.message).not.toContain("private request");
});
