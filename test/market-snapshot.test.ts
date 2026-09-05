import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarketSnapshot } from "../src/backend/market-snapshot.ts";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const MIN = 60_000;
const directories: string[] = [];

async function cachePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "market-snapshot-"));
  directories.push(directory);
  return path.join(directory, "market-snapshot.json");
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const listing = (itemId: string, unitPrice: number, extra: Record<string, unknown> = {}) => ({
  itemId, unitPrice, displayName: itemId, stats: [{ name: "Luk", value: 3, type: 5, percent: false }], expiresAt: null, ...extra,
});

function body(generatedAt: string, listings: unknown[]) {
  return { marketId: "global", generatedAt, listings };
}

function api(responses: Array<() => Response>) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const respond = responses[Math.min(calls.length, responses.length) - 1]!;
    return respond();
  };
  return { calls, fetch };
}

function fresh(generatedAt = "2026-09-05T11:50:00.000Z", listings: unknown[] = [listing("Mage Plate", 1_998, { enhancements: { refine: 2, artifactSlot: 2, cards: [], gems: [] } })]) {
  return () => Response.json(body(generatedAt, listings));
}

describe("MarketSnapshot", () => {
  test("downloads once for concurrent callers, indexes by item, and caches the raw body", async () => {
    const file = await cachePath();
    const { calls, fetch } = api([fresh()]);
    const snapshot = await MarketSnapshot.load({ cachePath: file, endpoint: "https://market.test", now: () => new Date(NOW), fetch });
    expect(snapshot.view()).toEqual({ generatedAt: null, listings: 0 });

    const [first, second] = await Promise.all([snapshot.body(), snapshot.body()]);
    expect(calls).toEqual(["https://market.test/v2/markets/global/snapshot"]);
    expect(first).toBe(second);
    expect(first).toEqual(body("2026-09-05T11:50:00.000Z", [listing("Mage Plate", 1_998, { enhancements: { refine: 2, artifactSlot: 2, cards: [], gems: [] } })]));
    expect(snapshot.view()).toEqual({ generatedAt: "2026-09-05T11:50:00.000Z", listings: 1 });
    expect(snapshot.listingsFor("Mage Plate")).toEqual([
      { itemId: "Mage Plate", unitPrice: 1_998, stats: [{ name: "Luk", value: 3 }], refine: 2, artifactSlot: 2 },
    ]);
    expect(snapshot.listingsFor("Unknown")).toEqual([]);

    await snapshot.body();
    expect(calls).toHaveLength(1);
    const cached = JSON.parse(await readFile(file, "utf8")) as { fetchedAt: string; body: unknown };
    expect(cached).toEqual({ fetchedAt: new Date(NOW).toISOString(), body: first });
  });

  test("survives a restart with refine, artifact slot, and expiry intact", async () => {
    const file = await cachePath();
    let clock = NOW;
    const { calls, fetch } = api([fresh("2026-09-05T11:50:00.000Z", [
      listing("Corporeal", 9_000, { enhancements: { refine: 1, artifactSlot: 0 } }),
      listing("Corporeal", 500, { enhancements: { refine: 0, artifactSlot: 1 }, expiresAt: "2026-09-05T12:30:00.000Z" }),
    ])]);
    const first = await MarketSnapshot.load({ cachePath: file, now: () => new Date(clock), fetch });
    await first.body();
    expect(first.listingsFor("Corporeal").map((entry) => [entry.refine, entry.artifactSlot])).toEqual([[1, 0], [0, 1]]);

    clock = NOW + 5 * MIN;
    const reloaded = await MarketSnapshot.load({ cachePath: file, now: () => new Date(clock), fetch });
    expect(reloaded.listingsFor("Corporeal").map((entry) => [entry.refine, entry.artifactSlot])).toEqual([[1, 0], [0, 1]]);
    expect(await reloaded.body()).toEqual(await first.body());
    expect(calls).toHaveLength(1);

    clock = NOW + 35 * MIN;                                   // past the second listing's expiry
    const later = await MarketSnapshot.load({ cachePath: file, now: () => new Date(clock), fetch });
    expect(later.listingsFor("Corporeal").map((entry) => [entry.refine, entry.artifactSlot])).toEqual([[1, 0]]);
    expect(later.view()).toEqual({ generatedAt: "2026-09-05T11:50:00.000Z", listings: 1 });
  });

  test("keeps a successful download on the normal cadence when the cache cannot be written", async () => {
    const directory = await cachePath();
    await writeFile(directory, "a file where the cache directory should be");
    const { calls, fetch } = api([fresh()]);
    const snapshot = await MarketSnapshot.load({ cachePath: path.join(directory, "market-snapshot.json"), now: () => new Date(NOW), fetch });
    expect(await snapshot.refresh()).toBe(true);
    expect(snapshot.listingsFor("Mage Plate")).toHaveLength(1);
    const view = snapshot.view();
    expect(view.warning).toBeUndefined();
    expect(view.cacheWarning).toMatch(/^Market snapshot could not be cached: /);
    expect(await snapshot.ensureFresh()).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("keeps stale data and reports a warning when the download fails", async () => {
    const file = await cachePath();
    await writeFile(file, JSON.stringify({ fetchedAt: new Date(NOW - 20 * MIN).toISOString(), body: body("2026-09-05T11:00:00.000Z", [listing("Ghost", 4_000)]) }));
    const { calls, fetch } = api([() => new Response("down", { status: 503 })]);
    const snapshot = await MarketSnapshot.load({ cachePath: file, now: () => new Date(NOW), fetch });
    expect(await snapshot.body()).toEqual(body("2026-09-05T11:00:00.000Z", [listing("Ghost", 4_000)]));
    expect(calls).toHaveLength(1);
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
