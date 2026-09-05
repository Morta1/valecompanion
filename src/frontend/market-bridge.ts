import type { LootItemView } from "../shared/contracts.ts";

export type MarketBridgeMessage =
  | { type: "valecompanion:market-open"; search: string; name: string }
  | { type: "valecompanion:bag"; bag: LootItemView[] };

export function marketOpenRequest(item: LootItemView): MarketBridgeMessage {
  const params = new URLSearchParams({ item: item.itemId });
  if (item.kind === "artifact") params.set("slot", item.type);
  const stats = item.lines
    .filter((line) => !line.isChaos)
    .map((line) => (line.printed === null ? line.stat : `${line.stat}:${line.printed}`));
  if (stats.length) params.set("stats", stats.join(","));
  return { type: "valecompanion:market-open", search: params.toString(), name: item.name || item.itemId };
}

export function bagSignature(bag: LootItemView[]): string {
  return bag.map((item) => `${item.uid}:${item.count}`).join("|");
}
