// ============================================================
// BOON_SHOP.JS (resources) — fixed pricing data for the boon shop.
//
// Same role as base_score.js: fixed numbers only, no functions
// (Rule 6). js/gameplay/boon_shop.js is the only place that reads
// these to actually compute a price. Distinct from the OLD, still-
// dormant resources/shop/shop.js (artifact/relic/fossil pool) —
// that file is untouched by this feature.
// ============================================================

import { BOON_RARITY } from '../boon/boon.js';

// --- base pricing ---
export const BASE_BOON_PRICE = 500;       // flat starting price before any multiplier
export const BASE_PRICE_MULTIPLIER = 1.0; // global tuning knob — currently a no-op (1x)

// --- inflation ---
// Applied per SHOP TIER (one tier = one shop visit = every
// SHOP_LEVEL_INTERVAL levels cleared — see resources/shop/shop.js).
// Tier 1 (the very first shop, level 5) pays NO inflation yet
// (1.15^0 = 1x) — see gameplay/boon_shop.js's calculateBoonPrice()
// for the (tier - 1) exponent.
export const INFLATION_RATE_PER_TIER = 0.15;

// --- rarity multiplier ---
export const BOON_SHOP_RARITY_MULTIPLIER = {
  [BOON_RARITY.COMMON]: 1.0,
  [BOON_RARITY.UNCOMMON]: 1.25,
  [BOON_RARITY.RARE]: 1.75,
  [BOON_RARITY.EPIC]: 2.5,
  [BOON_RARITY.LEGENDARY]: 3.25,
};

// --- offer size ---
export const BOON_SHOP_OFFER_COUNT = 5; // how many boons the shop shows per visit