import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarketSnapshot } from "../src/backend/market-snapshot.ts";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const directories: string[] = [];

async function cachePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "market-snapshot-"));
  directories.push(directory);
  return path.join(directory, "market-snapshot.json");
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function body(generatedAt: string, listings: unknown[]): string {
  return JSON.stringify({ marketId: "global", generatedAt, listings });
}

const listing = (itemId: string, unitPrice: number, extra: Record<string, unknown> = {}) => ({
  itemId, unitPrice, stats: [{ name: "Luk", value: 3, type: 5, percent: false }], expiresAt: null, ...extra,
});

describe("MarketSnapshot", () => {
  test("fetches, indexes by item, and caches the snapshot", async () => {
    const file = await cachePath();
    const calls: string[] = [];
    const snapshot = await MarketSnapshot.load({
      cachePath: file,
      endpoint: "https://market.test",
      now: () => new Date(NOW),
      fetch: async (url: string) => {
        calls.push(url);
        return new Response(body("2026-09-05T11:50:00.000Z", [
          listing("Mage Plate", 1_998, { enhancements: { refine: 0, artifactSlot: 2, cards: [], gems: [] } }),
          listing("Mage Plate", 500, { expiresAt: "2026-09-05T11:00:00.000Z" }),
          { itemId: "Broken", stats: "nope" },
        ]));
      },
    });
    expect(snapshot.view()).toEqual({ generatedAt: null, listings: 0 });
    await snapshot.refresh();
    expect(calls).toEqual(["https://market.test/v2/markets/global/snapshot"]);
    expect(snapshot.view()).toEqual({ generatedAt: "2026-09-05T11:50:00.000Z", listings: 1 });
    expect(snapshot.listingsFor("Mage Plate")).toEqual([
      { itemId: "Mage Plate", unitPrice: 1_998, stats: [{ name: "Luk", value: 3 }], refine: 0, artifactSlot: 2 },
    ]);
    expect(snapshot.listingsFor("Unknown")).toEqual([]);
    const cached = JSON.parse(await readFile(file, "utf8")) as { listings: unknown[] };
    expect(cached.listings).toHaveLength(1);
  });

  test("serves the cached snapshot before the first refresh", async () => {
    const file = await cachePath();
    await writeFile(file, body("2026-09-05T11:55:00.000Z", [listing("Ghost", 4_000)]));
    const snapshot = await MarketSnapshot.load({ cachePath: file, now: () => new Date(NOW), fetch: () => { throw new Error("offline"); } });
    expect(snapshot.view()).toEqual({ generatedAt: "2026-09-05T11:55:00.000Z", listings: 1 });
    expect(snapshot.listingsFor("Ghost")).toHaveLength(1);
  });

  test("keeps stale data and reports a warning when the refresh fails", async () => {
    const file = await cachePath();
    await writeFile(file, body("2026-09-05T11:00:00.000Z", [listing("Ghost", 4_000)]));
    const snapshot = await MarketSnapshot.load({ cachePath: file, now: () => new Date(NOW), fetch: async () => new Response("down", { status: 503 }) });
    await snapshot.refresh();
    expect(snapshot.listingsFor("Ghost")).toHaveLength(1);
    expect(snapshot.view()).toEqual({
      generatedAt: "2026-09-05T11:00:00.000Z",
      listings: 1,
      warning: "Market prices may be stale: market snapshot returned HTTP 503",
    });
  });

  test("ignores an unreadable cache file", async () => {
    const file = await cachePath();
    await writeFile(file, "{not json");
    const warnings: string[] = [];
    const snapshot = await MarketSnapshot.load({
      cachePath: file,
      now: () => new Date(NOW),
      logger: { sessionId: "t", debug() {}, info() {}, warn(event) { warnings.push(event); }, error() {} },
    });
    expect(snapshot.view()).toEqual({ generatedAt: null, listings: 0 });
    expect(warnings).toEqual(["state.load.invalid"]);
  });
});
