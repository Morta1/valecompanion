import { expect, test } from "bun:test";
import { priceItem } from "../src/core/market-value.ts";
import { LootSession } from "../src/core/loot-session.ts";
import type { SaviInventory } from "../src/core/types.ts";

const empty = (): SaviInventory => ({ equips: [], artifacts: [], cards: [], gems: [], junks: [], consumables: [], cosmetics: [] });
const card = (count: number) => ({ itemId: "Abomination", count, favorite: false });

test("storage replaces contents independently and never records loot alerts", () => {
  const bag = new LootSession();
  const storage = new LootSession({ silent: true, soundsEnabled: () => true, onSound: () => { throw new Error("Storage must be silent"); } });
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


test("bag and storage both retain materials, consumables, and cosmetics", () => {
  const inventory: SaviInventory = { ...empty(),
    junks: [{ itemId: "material", count: 12, favorite: false }],
    consumables: [{ itemId: "potion", count: 4, favorite: true }],
    cosmetics: [{ itemId: "hat", uid: "cosmetic-uid", refine: 3, favorite: true }],
  };
  for (const session of [new LootSession(), new LootSession({ silent: true })]) {
    session.consumeInventory(inventory);
    const items = session.bag();
    expect(items).toHaveLength(3);
    for (const item of items) expect(priceItem(item, [{ itemId: item.itemId, unitPrice: 999, stats: [], refine: 0, artifactSlot: null }])).toBeNull();
    expect(items.find(item => item.kind === "material")?.count).toBe(12);
    expect(items.find(item => item.kind === "consumable")?.count).toBe(4);
    expect(items.find(item => item.kind === "cosmetic")).toMatchObject({ uid: "cosmetic-uid", refine: 3, favorite: true });
    session.consumeInventory(empty());
    expect(session.bag()).toEqual([]);
  }
});


test("shared item IDs retain category-specific card and cosmetic identities", () => {
  for (const session of [new LootSession(), new LootSession({ silent: true })]) {
    session.consumeInventory({ ...empty(), cards: [{ itemId: "Turtle", count: 2, favorite: false }], cosmetics: [{ itemId: "Turtle", uid: "pet-uid", refine: 0, favorite: false }] });
    const card = session.bag().find(item => item.kind === "card")!;
    const pet = session.bag().find(item => item.kind === "cosmetic")!;
    expect(card.name).toBe("Turtle Baby Card");
    expect(card.icon).toBe("card.webp");
    expect(pet.name).toBe("Turtle Baby Pet");
    expect(pet.icon).toBe("cosmetic-turtle.webp");
    expect(pet.uid).not.toBe(card.uid);
  }
});


test("bundled cosmetic artwork exists and never uses card artwork", async () => {
  const catalog = await Bun.file(new URL("../assets/cosmetics.json", import.meta.url)).json() as Record<string, { icon?: string }>;
  for (const entry of Object.values(catalog)) {
    if (!entry.icon) continue;
    expect(entry.icon.startsWith("icons/cosmetic-")).toBe(true);
    expect(await Bun.file(new URL(`../assets/${entry.icon}`, import.meta.url)).exists()).toBe(true);
  }
});
