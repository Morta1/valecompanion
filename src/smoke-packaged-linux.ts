import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.platform !== "linux") throw new Error("Run the Linux package smoke test on Linux.");
const root = path.resolve(import.meta.dir, "..");
const { version } = await Bun.file(path.join(root, "package.json")).json();
const executable = process.argv[2] ?? path.join(root, "dist", `ValeCompanion-${version}-linux-x86_64.AppImage`);
if (!existsSync(executable)) throw new Error(`Package is missing: ${executable}`);
const dataDirectory = mkdtempSync(path.join(tmpdir(), "valecompanion-package-smoke-"));
const captureMode = process.env.VALECOMPANION_SMOKE_CAPTURE_MODE ?? "auto";
if (!["auto", "libpcap", "dumpcap"].includes(captureMode)) throw new Error("Invalid smoke-test capture mode.");
writeFileSync(path.join(dataDirectory, "settings.json"), JSON.stringify({ enabled: true, contributionEnabled: false, soundsEnabled: false, linuxCaptureMode: captureMode }));
const application = Bun.spawn([executable, `--user-data-dir=${dataDirectory}`], {
  env: { ...process.env, VALECOMPANION_DATA_DIR: dataDirectory, VALECOMPANION_SMOKE_TEST: "1", APPIMAGE_EXTRACT_AND_RUN: "1" },
  stdout: "ignore", stderr: "pipe", stdin: "ignore",
});
const diagnosticOutput = new Response(application.stderr).text();
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; application.kill(); }, 60_000);
try {
  const code = await application.exited;
  if (timedOut || code !== 0) throw new Error(`Linux package smoke test failed (${timedOut ? "timeout" : code}).`);
  const log = await Bun.file(path.join(dataDirectory, "logs", "desktop.log")).text();
  if (!log.includes("Packaged smoke test passed")) throw new Error("Package exited without completing the renderer smoke test.");
  if (process.env.VALECOMPANION_SMOKE_EXPECT_CAPTURE === "1") {
    const collectorLog = await Bun.file(path.join(dataDirectory, "logs", "collector.log")).text();
    if (!collectorLog.includes("Packet capture started") || !collectorLog.includes('"phase":"waiting-for-game"')) {
      throw new Error("The packaged collector did not open capture and reach waiting-for-game.");
    }
    console.log("Packaged capture opened successfully as a non-root user, waiting for the game.");
  }
  console.log("Linux package launched its collector and renderer successfully.");
} catch (error) {
  console.error((await diagnosticOutput).slice(-12_000));
  throw error;
} finally {
  clearTimeout(timeout);
  rmSync(dataDirectory, { recursive: true, force: true });
}
