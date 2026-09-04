import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCollectorMessage, type CollectorMessage } from "../src/shared/collector-protocol.ts";

const LEGACY_FIXED_PORT = 47_832;
const root = path.resolve(import.meta.dir, "..");

test("collector starts when the legacy fixed port is occupied", async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "valecompanion-startup-"));
  writeFileSync(path.join(dataDirectory, "settings.json"), JSON.stringify({
    enabled: false,
    soundsEnabled: false,
    contributionEnabled: false,
    deviceName: null,
    linuxCaptureMode: "auto",
    filter: "",
    active: "Default",
    profiles: { Default: "" },
  }));

  const blocker = Bun.serve({
    hostname: "127.0.0.1",
    port: LEGACY_FIXED_PORT,
    fetch: () => new Response("occupied"),
  });
  const collector = Bun.spawn([process.execPath, "src/backend/index.ts"], {
    cwd: root,
    env: {
      ...process.env,
      VALECOMPANION_APP_ROOT: root,
      VALECOMPANION_DATA_DIR: dataDirectory,
      VALECOMPANION_RENDERER_DIR: path.join(root, "src", "frontend"),
      VALECOMPANION_VERSION: "test",
      VALECOMPANION_LOG_FILE: path.join(dataDirectory, "collector.log"),
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    const message = await readCollectorMessage(collector.stdout);
    expect(message?.type).toBe("ready");
    if (!message || message.type !== "ready") throw new Error("Collector did not report ready");
    expect(message.port).not.toBe(LEGACY_FIXED_PORT);

    const response = await fetch(`http://127.0.0.1:${message.port}/v1/state`);
    expect(response.status).toBe(200);
    const missingSession = await fetch(`http://127.0.0.1:${message.port}/v1/gold/history/missing`, { method: "DELETE" });
    expect(missingSession.status).toBe(404);
  } finally {
    collector.stdin.end();
    await collector.exited;
    blocker.stop(true);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
}, 10_000);

async function readCollectorMessage(stdout: ReadableStream<Uint8Array>): Promise<CollectorMessage | undefined> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return undefined;
      pending += decoder.decode(result.value, { stream: true });
      const newline = pending.indexOf("\n");
      if (newline < 0) continue;
      return parseCollectorMessage(pending.slice(0, newline + 1));
    }
  } finally {
    reader.releaseLock();
  }
}
