import { describe, expect, test } from "bun:test";
import { bagSignature, marketOpenRequest } from "../src/frontend/market-bridge.ts";
import type { LootItemView, LootLine } from "../src/shared/contracts.ts";

function line(stat: string, printed: number | null, isChaos = false): LootLine {
  return { stat, printed, rollPct: 50, isChaos, over: false };
}

function item(overrides: Partial<LootItemView> = {}): LootItemView {
  return {
    uid: "rune-1", itemId: "Corporeal", name: "Corporeal Rune", type: "Rune", kind: "artifact", icon: null, refine: 0, count: 1,
    favorite: false, hasChaos: false, topRolls: 0, highRolls: 0, avgRollPct: null, match: null,
    lines: [line("Str", 3), line("HpMult", 2)],
    ...overrides,
  };
}

describe("bagSignature", () => {
  test("changes when an item is refined or rerolled under the same UID and count", () => {
    const before = bagSignature([item()]);
    expect(bagSignature([item()])).toBe(before);
    expect(bagSignature([item({ refine: 1 })])).not.toBe(before);
    expect(bagSignature([item({ lines: [line("Str", 4), line("HpMult", 2)] })])).not.toBe(before);
    expect(bagSignature([item({ lines: [line("Dex", 3), line("HpMult", 2)] })])).not.toBe(before);
    expect(bagSignature([item({ lines: [line("Str", 3), line("HpMult", 2, true)], hasChaos: true })])).not.toBe(before);
    expect(bagSignature([item({ favorite: true })])).not.toBe(before);
  });

  test("changes when items are added, removed, or restacked", () => {
    const one = bagSignature([item()]);
    expect(bagSignature([item(), item({ uid: "rune-2" })])).not.toBe(one);
    expect(bagSignature([item({ count: 2 })])).not.toBe(one);
    expect(bagSignature([])).toBe("");
  });
});

describe("marketOpenRequest", () => {
  test("encodes the item, artifact slot, and stat lines as a market URL query", () => {
    const request = marketOpenRequest(item({ lines: [line("Str", 3), line("Crit", null), line("Luk", 9, true)] }));
    expect(request).toEqual({ type: "valecompanion:market-open", search: "item=Corporeal&slot=Rune&stats=Str%3A3%2CCrit", name: "Corporeal Rune" });
  });

  test("omits the slot for equipment and the stats when none decoded", () => {
    const request = marketOpenRequest(item({ kind: "equipment", type: "Chest", itemId: "Mage Plate", name: "", lines: [] }));
    expect(request).toEqual({ type: "valecompanion:market-open", search: "item=Mage+Plate", name: "Mage Plate" });
  });
});
