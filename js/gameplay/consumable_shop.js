// ============================================================
// CONSUMABLE_SHOP.JS (gameplay) — consumable-shop offer generation +
// pricing + purchase bookkeeping. Distinct from boon_shop.js, but
// shares the SAME shop visit/dialog (main.js opens both sections
// together) and the SAME "score at shop-open" snapshot pricing
// convention boon_shop.js already established.
// ============================================================

import { consumableShopState } from '../resources/shop/consumable_shop_state.js';
import { CONSUMABLE_INFO, CONSUMABLE_TYPE, CONSUMABLE_SHOP_OFFER_COUNT } from '../resources/consumable/consumable.js';

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Rolls a fresh offer of CONSUMABLE_SHOP_OFFER_COUNT (3) DISTINCT
 * consumable types — "they must not be the same," per design — so
 * this is a shuffle-and-take of the whole catalog rather than an
 * independent per-slot random roll (which could repeat a type).
 *
 * @returns {void}
 */
export function rollConsumableShopOffer() {
  const allTypes = Object.values(CONSUMABLE_TYPE);
  consumableShopState.offer = shuffle(allTypes).slice(0, CONSUMABLE_SHOP_OFFER_COUNT);
  consumableShopState.purchasedTypes = [];
}

/**
 * Price for one consumable — a flat PERCENT of the score the player
 * had at shop-open (the shopEntryScore snapshot main.js already takes
 * for boon pricing), per-type via CONSUMABLE_INFO.pricePercent.
 *
 * KNOWN EDGE CASE: if shopEntryScore is 0 (a very early shop visit),
 * every consumable prices out to 0 — free. Not guarded against; in
 * practice the first shop visit (level 5) should always have a
 * meaningfully non-zero score by then given the target-score curve.
 * Flag if this ever actually happens.
 *
 * @param {string} type - a CONSUMABLE_TYPE value.
 * @param {number} shopEntryScore
 * @returns {number} whole-number score cost.
 */
export function calculateConsumablePrice(type, shopEntryScore) {
  const info = CONSUMABLE_INFO[type];
  return Math.round(shopEntryScore * info.pricePercent);
}

/**
 * Whether a given offer entry has already been bought this visit —
 * drives the greyed-out/disabled look on its card.
 *
 * @param {string} type
 * @returns {boolean}
 */
export function isConsumablePurchasedThisVisit(type) {
  return consumableShopState.purchasedTypes.includes(type);
}

/**
 * Records a successful purchase so the same TYPE can't be bought
 * twice in one visit — mirrors boon_shop.js's markBoonPurchased(),
 * just keyed by consumable type instead of boon id (a consumable
 * offer entry has no separate "id," the type IS the identity here).
 *
 * @param {string} type
 * @returns {void}
 */
export function markConsumablePurchased(type) {
  consumableShopState.purchasedTypes.push(type);
}

/**
 * Clears the consumable shop's per-visit state. Call from main.js's
 * init(), same safety-net reasoning as boon_shop.js's resetBoonShop().
 *
 * @returns {void}
 */
export function resetConsumableShop() {
  consumableShopState.offer = [];
  consumableShopState.purchasedTypes = [];
}