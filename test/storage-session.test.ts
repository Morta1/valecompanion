import { expect, test } from "bun:test";
import { LootSession } from "../src/core/loot-session.ts";
import type { SaviInventory } from "../src/core/types.ts";

const empty = (): SaviInventory => ({ equips: [], artifacts: [], cards: [], gems: [], junks: [], consumables: [], cosmetics: [] });
const card = (count: number) => ({ itemId: "Abomination", count, favorite: false });

test("storage replaces contents independently and never records loot alerts", () => {
  const bag = new LootSession();
  const storage = new LootSession({ includeStorageItems: true, silent: true, soundsEnabled: () => true, onSound: () => { throw new Error("Storage must be silent"); } });
  storage.setFilter('Show "all"\n  Sound alert');
  bag.consumeInventory({ ...empty(), cards: [card(2)] });
  storage.consumeInventory(empty());
  storage.consumeInventory({ ...empty(), cards: [card(5)], junks: [{ itemId: "Unknown material", count: 8, favorite: false }], consumables: [{ itemId: "Unknown potion", count: 3, favorite: false }], cosmetics: [{ itemId: "Unknown hat", uid: "hat", refine: 2, favorite: true }] });
  expect(bag.bag()[0]?.count).toBe(2);
  expect(storage.bag()).toHaveLength(4);
  expect(storage.bag().map(item => item.kind).sort()).toEqual(["card", "consumable", "cosmetic", "material"]);
  expect(storage.history()).toEqual([]);
  storage.consumeInventory(empty());
  expect(storage.bag()).toEqual([]);
  expect(bag.bag()).toHaveLength(1);
  storage.resetCharacter();
  expect(storage.bag()).toEqual([]);
});

test("bag updates from storage transfers are silent but later loot still alerts", () => {
  const bag = new LootSession();
  bag.setFilter('Show "all"');
  bag.consumeInventory({ ...empty(), cards: [card(1)] });
  bag.consumeInventory({ ...empty(), cards: [card(2)] }, false, true);
  expect(bag.history()).toEqual([]);
  bag.consumeInventory({ ...empty(), cards: [card(3)] });
  expect(bag.history()).toHaveLength(1);
});
