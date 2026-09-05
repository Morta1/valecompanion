import type { MarketListing } from "../core/market-value.ts";
import type { MarketPricesView } from "../shared/contracts.ts";
import { MARKET_API_URL } from "./market-contracts.ts";
import { errorLogFields, type AppLogger } from "./market-logger.ts";
import { errorMessage, isRecord, loadJson, writeJsonAtomic } from "./market-storage.ts";

const REFRESH_INTERVAL_MS = 15 * 60 * 1_000;
const RETRY_INTERVAL_MS = 2 * 60 * 1_000;

interface SnapshotState {
  generatedAt: string;
  listings: MarketListing[];
}

export interface MarketSnapshotOptions {
  cachePath: string;
  endpoint?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
  logger?: AppLogger;
}

// Read-only mirror of the public ValeMarket snapshot, refreshed on the API's own
// 15 minute cadence and kept across failures so bag pricing degrades to stale, not empty.
export class MarketSnapshot {
  private byItem = new Map<string, MarketListing[]>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly lifetime = new AbortController();
  private warning: string | undefined;
  private readonly endpoint: string;
  private readonly fetch: NonNullable<MarketSnapshotOptions["fetch"]>;
  private readonly now: () => Date;

  private constructor(private readonly options: MarketSnapshotOptions, private state: SnapshotState | null) {
    this.endpoint = (options.endpoint ?? MARKET_API_URL).replace(/\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
    this.index();
  }

  static async load(options: MarketSnapshotOptions): Promise<MarketSnapshot> {
    const now = (options.now ?? (() => new Date()))().getTime();
    const state = await loadJson<SnapshotState | null>(options.cachePath, () => null, (value) => parseState(value, now), (error) => {
      options.logger?.warn("state.load.invalid", { state: "market-snapshot", ...errorLogFields(error) });
    });
    return new MarketSnapshot(options, state);
  }

  listingsFor(itemId: string): MarketListing[] {
    return this.byItem.get(itemId) ?? [];
  }

  view(): MarketPricesView {
    return {
      generatedAt: this.state?.generatedAt ?? null,
      listings: this.state?.listings.length ?? 0,
      ...(this.warning === undefined ? {} : { warning: this.warning }),
    };
  }

  start(): void {
    const age = this.state ? this.now().getTime() - Date.parse(this.state.generatedAt) : Infinity;
    this.schedule(Math.max(0, REFRESH_INTERVAL_MS - age));
  }

  stop(): void {
    clearTimeout(this.refreshTimer);
    this.lifetime.abort();
  }

  async refresh(): Promise<boolean> {
    try {
      const response = await this.fetch(`${this.endpoint}/v2/markets/global/snapshot`, {
        redirect: "error",
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) throw new Error(`market snapshot returned HTTP ${response.status}`);
      const next = parseState(await response.json(), this.now().getTime());
      if (!next) throw new Error("market snapshot returned an invalid response");
      this.state = next;
      this.warning = undefined;
      this.index();
      await writeJsonAtomic(this.options.cachePath, next);
      this.options.logger?.info("market_snapshot.refreshed", { generatedAt: next.generatedAt, listings: next.listings.length });
      return true;
    } catch (error) {
      this.warning = `Market prices ${this.state ? "may be stale" : "are unavailable"}: ${errorMessage(error)}`;
      this.options.logger?.warn("market_snapshot.refresh_failed", errorLogFields(error));
      return false;
    }
  }

  private schedule(delayMs: number): void {
    if (this.lifetime.signal.aborted) return;
    this.refreshTimer = setTimeout(() => {
      void this.refresh().then((ok) => this.schedule(ok ? REFRESH_INTERVAL_MS : RETRY_INTERVAL_MS));
    }, delayMs);
  }

  private index(): void {
    this.byItem = new Map();
    for (const listing of this.state?.listings ?? []) {
      const group = this.byItem.get(listing.itemId) ?? [];
      group.push(listing);
      this.byItem.set(listing.itemId, group);
    }
  }
}

function parseState(value: unknown, now: number): SnapshotState | null {
  if (!isRecord(value) || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))
    || !Array.isArray(value.listings)) return null;
  const listings: MarketListing[] = [];
  for (const entry of value.listings) {
    const listing = parseListing(entry, now);
    if (listing) listings.push(listing);
  }
  return { generatedAt: value.generatedAt, listings };
}

function parseListing(value: unknown, now: number): MarketListing | null {
  if (!isRecord(value) || typeof value.itemId !== "string" || typeof value.unitPrice !== "number" || !Array.isArray(value.stats)) return null;
  if (typeof value.expiresAt === "string" && Date.parse(value.expiresAt) <= now) return null;
  const stats: MarketListing["stats"] = [];
  for (const stat of value.stats) {
    if (isRecord(stat) && typeof stat.name === "string" && typeof stat.value === "number") stats.push({ name: stat.name, value: stat.value });
  }
  const enhancements = isRecord(value.enhancements) ? value.enhancements : {};
  return {
    itemId: value.itemId,
    unitPrice: value.unitPrice,
    stats,
    refine: typeof enhancements.refine === "number" ? enhancements.refine : 0,
    artifactSlot: typeof enhancements.artifactSlot === "number" ? enhancements.artifactSlot : null,
  };
}
