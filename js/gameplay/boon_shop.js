// ============================================================
// BOON_SHOP.JS (gameplay) — boon-shop offer generation + pricing +
// purchase bookkeeping.
//
// Distinct from the OLD, still-dormant artifact/relic/fossil shop in
// gameplay/shop.js — that system is untouched. This sells extra
// BOON_POOL picks for score instead of the usual free level-up pick.
// The only thing reused from the old shop module is
// SHOP_LEVEL_INTERVAL/shouldOpenShop() — the "every 5 levels" cadence
// is shared, not the item pool or pricing.
// ============================================================

import { boonShopState } from '../resources/shop/boon_shop_state.js';
import {
  BASE_BOON_PRICE, BASE_PRICE_MULTIPLIER, INFLATION_RATE_PER_TIER,
  BOON_SHOP_RARITY_MULTIPLIER, BOON_SHOP_OFFER_COUNT,
} from '../resources/shop/boon_shop.js';
import { SHOP_LEVEL_INTERVAL } from '../resources/shop/shop.js';
import { generateEqualWeightBoonOffer } from './boon.js';

// CHANGE — was a local `const`, now exported so gameplay/event.js can
// reuse the exact same "these kinds need a placement click, don't
// hand them out as a random reward" filter, instead of duplicating
// the Set of kind strings a second time.
export const PLACEMENT_ONLY_KINDS = new Set(['board_expand', 'board_shrink', 'board_expand_and_shrink']);

/**
 * Price to buy one boon from the shop, given its rarity and which
 * shop TIER this is.
 *
 *   price = ROUND(BASE_BOON_PRICE x rarityMultiplier x inflation x BASE_PRICE_MULTIPLIER)
 *   inflation = (1 + INFLATION_RATE_PER_TIER) ^ (tier - 1)
 *
 * Tier 1 (the very first shop visit, level SHOP_LEVEL_INTERVAL) pays
 * NO inflation yet (exponent is 0). Tier 2 (level SHOP_LEVEL_INTERVAL
 * x 2) is the first one actually inflated (x1.15), and so on.
 *
 * @param {string} rarity - a BOON_RARITY value.
 * @param {number} tier - which shop visit this is (1-based).
 * @param {number} score - the player's current score.
 * @returns {number} whole-number score cost.
 */
export function calculateBoonPrice(rarity, tier, score) {
  const rarityMultiplier = BOON_SHOP_RARITY_MULTIPLIER[rarity] ?? 1.0;
  const inflation = Math.pow(1 + INFLATION_RATE_PER_TIER, tier - 1);
  return Math.round(BASE_BOON_PRICE * rarityMultiplier * inflation * BASE_PRICE_MULTIPLIER) + Math.round(score * rarityMultiplier);
}

/**
 * Which shop "tier" a cleared level corresponds to — tier 1 is the
 * very first shop (level === SHOP_LEVEL_INTERVAL), tier 2 the next
 * (level === SHOP_LEVEL_INTERVAL x 2), etc. `level` is assumed to
 * already be a multiple of SHOP_LEVEL_INTERVAL — callers only ever
 * reach this after shouldOpenShop(level) has already said yes.
 *
 * @param {number} level
 * @returns {number}
 */
export function shopTierForLevel(level) {
  return Math.round(level / SHOP_LEVEL_INTERVAL);
}

/**
 * Rolls a fresh offer into boonShopState and clears the "already
 * bought this visit" list. Call once, right as the shop dialog opens.
 *
 * Reuses boon.js's generateEqualWeightBoonOffer() — same
 * maxOccurrences/gem-unlock gate the free level-up dialog uses (the
 * shop and the free pick share one pool of "how many times has this
 * exact boon been taken"), just equal-weighted instead of
 * rarity-weighted, and with board-shape boons filtered out (see
 * PLACEMENT_ONLY_KINDS above).
 *
 * @returns {void}
 */
export function rollBoonShopOffer() {
  boonShopState.offer = generateEqualWeightBoonOffer(
    BOON_SHOP_OFFER_COUNT,
    def => !PLACEMENT_ONLY_KINDS.has(def.effect?.kind)
  );
  boonShopState.purchasedIds = [];
}

/**
 * Whether a given offer entry has already been bought this visit —
 * drives the greyed-out/disabled look on its card.
 *
 * @param {string} boonId
 * @returns {boolean}
 */
export function isBoonPurchasedThisVisit(boonId) {
  return boonShopState.purchasedIds.includes(boonId);
}

/**
 * Records a successful purchase so the same card can't be bought
 * twice in one visit. Does NOT touch score or apply the boon's
 * effect — main.js's buyBoonFromShop() handles both (score
 * deduction + pickBoon()/applyBoonEffect()), same "logic file
 * decides what CAN happen, main.js decides what actually happens and
 * when" split used everywhere else in this codebase.
 *
 * @param {string} boonId
 * @returns {void}
 */
export function markBoonPurchased(boonId) {
  boonShopState.purchasedIds.push(boonId);
}

/**
 * Clears the shop's per-visit state. Call from main.js's init() for
 * safety (in case "start over" is used mid-visit) — a fresh run
 * should never open with a stale offer/purchased list lingering.
 *
 * @returns {void}
 */
export function resetBoonShop() {
  boonShopState.offer = [];
  boonShopState.purchasedIds = [];
}