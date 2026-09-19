// ============================================================
// SHOP.JS (resources) — the full pool of items the shop can offer,
// plus the fixed shop-wide settings (how often it opens, how many
// items it shows, how many consumables the player can hold).
//
// Same role as boon.js: fixed, game-wide data. Each pool
// entry is a *template* — js/gameplay/shop.js turns a purchased
// template into an OwnedItem instance (see shop_state.js) when the
// player buys it. `effect` is a free-form payload — shop.js
// (gameplay) never looks inside it; that's yours to read from
// wherever you apply the actual item effects.
// ============================================================

export const ITEM_CATEGORY = {
  ARTIFACT: 'artifact',
  RELIC: 'relic',
  FOSSIL: 'fossil',
  CONSUMABLE: 'consumable',
};

// --- shop-wide settings ---
export const SHOP_LEVEL_INTERVAL = 5;        // shop opens every N levels (after the boon pick)
export const SHOP_MAIN_ITEM_COUNT = 6;       // artifact/relic/fossil items offered per visit
export const SHOP_CONSUMABLE_ITEM_COUNT = 3; // consumable items offered per visit
export const MAX_CONSUMABLES_HELD = 3;       // total consumables the player can hold at once

// Draft pool — a couple of examples per category to show the shape.
// basePrice is scaled by calculateItemPrice(basePrice, level) in
// js/gameplay/shop.js — it's not the price the player actually pays.
export const SHOP_ITEM_POOL = [
  // --- artifacts ---
  {
    id: 'prospectors_loupe',
    name: "Prospector's Loupe",
    description: 'A passive trinket — effect TBD.',
    category: ITEM_CATEGORY.ARTIFACT,
    basePrice: 300,
    effect: {},
  },
  {
    id: 'miners_lantern',
    name: "Miner's Lantern",
    description: 'A passive trinket — effect TBD.',
    category: ITEM_CATEGORY.ARTIFACT,
    basePrice: 350,
    effect: {},
  },

  // --- relics ---
  {
    id: 'ancient_coin',
    name: 'Ancient Coin',
    description: 'A passive trinket — effect TBD.',
    category: ITEM_CATEGORY.RELIC,
    basePrice: 400,
    effect: {},
  },
  {
    id: 'sealed_urn',
    name: 'Sealed Urn',
    description: 'A passive trinket — effect TBD.',
    category: ITEM_CATEGORY.RELIC,
    basePrice: 450,
    effect: {},
  },

  // --- fossils ---
  {
    id: 'trilobite_shard',
    name: 'Trilobite Shard',
    description: 'A passive trinket — effect TBD.',
    category: ITEM_CATEGORY.FOSSIL,
    basePrice: 250,
    effect: {},
  },
  {
    id: 'amber_husk',
    name: 'Amber-Cased Husk',
    description: 'A passive trinket — effect TBD.',
    category: ITEM_CATEGORY.FOSSIL,
    basePrice: 280,
    effect: {},
  },

  // --- consumables (usable, stack up to MAX_CONSUMABLES_HELD) ---
  {
    id: 'bomb',
    name: 'Bomb',
    description: 'A one-time-use item — effect TBD.',
    category: ITEM_CATEGORY.CONSUMABLE,
    basePrice: 80,
    effect: {},
  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    description: 'A one-time-use item — effect TBD.',
    category: ITEM_CATEGORY.CONSUMABLE,
    basePrice: 120,
    effect: {},
  },
  {
    id: 'chisel',
    name: 'Chisel',
    description: 'A one-time-use item — effect TBD.',
    category: ITEM_CATEGORY.CONSUMABLE,
    basePrice: 60,
    effect: {},
  },
];