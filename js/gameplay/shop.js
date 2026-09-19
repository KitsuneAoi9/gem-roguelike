// ============================================================
// SHOP.JS — offer generation, purchase logic, shop-trigger check.
//
// Reads/writes shopState (resources/shop/shopState.js) but owns none
// of the state itself — same split as board.js (logic) vs. a grid
// array (data), just for the shop instead of the board.
// ============================================================

import {
  ITEM_CATEGORY, SHOP_ITEM_POOL, SHOP_LEVEL_INTERVAL,
  SHOP_MAIN_ITEM_COUNT, SHOP_CONSUMABLE_ITEM_COUNT, MAX_CONSUMABLES_HELD
} from '../resources/shop/shop.js';
import { shopState } from '../resources/shop/shopState.js';

/**
 * Whether a level should trigger a shop visit. Meant to be called
 * right after that level's boon has been picked.
 *
 * @param {number} level - the level just reached.
 * @returns {boolean} true if this level should open the shop.
 */
export function shouldOpenShop(level) {
  return level % SHOP_LEVEL_INTERVAL === 0;
}

/**
 * Price the player actually pays for an item at a given level.
 * Placeholder curve, same spirit as calculateScoreTarget — tune once
 * playtested.
 *
 * @param {number} basePrice - the item's SHOP_ITEM_POOL basePrice.
 * @param {number} level - current level, used to scale the price up.
 * @returns {number} whole-number score cost.
 */
export function calculateItemPrice(basePrice, level) {
  return Math.round(basePrice * Math.pow(1.15, level - 1));
}

/**
 * How many consumable items the player currently holds in total
 * (quantities summed across all consumable ids).
 *
 * @returns {number} total consumables held.
 */
function heldConsumableCount() {
  return shopState.inventory
    .filter(item => item.category === ITEM_CATEGORY.CONSUMABLE)
    .reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Whether a non-consumable definition can still be offered — false
 * once its id is in shopState.seenItemIds. Consumables are always
 * available, since they're meant to be bought repeatedly.
 *
 * @param {object} def - a SHOP_ITEM_POOL entry.
 * @returns {boolean} true if it can still show up in an offer.
 */
function isAvailable(def) {
  if (def.category === ITEM_CATEGORY.CONSUMABLE) return true;
  return !shopState.seenItemIds.includes(def.id);
}

/**
 * Fisher-Yates shuffle — used to sample offers without bias toward
 * the pool's declaration order.
 *
 * @param {any[]} array - array to shuffle (not mutated).
 * @returns {any[]} a new, shuffled array.
 */
function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Generates a fresh shop offer: up to `mainCount` distinct, still-
 * available artifact/relic/fossil items (mixed together, not split
 * evenly by category), plus up to `consumableCount` consumable items.
 * Every offered non-consumable id is immediately recorded in
 * shopState.seenItemIds, so it can never be offered again — even if
 * the player doesn't buy it.
 *
 * @param {number} [mainCount=SHOP_MAIN_ITEM_COUNT] - how many
 *   artifact/relic/fossil items to offer.
 * @param {number} [consumableCount=SHOP_CONSUMABLE_ITEM_COUNT] - how
 *   many consumable items to offer.
 * @returns {{ items: object[], consumables: object[] }} the offer.
 */
export function generateShopOffer(mainCount = SHOP_MAIN_ITEM_COUNT, consumableCount = SHOP_CONSUMABLE_ITEM_COUNT) {
  const mainPool = SHOP_ITEM_POOL.filter(
    def => def.category !== ITEM_CATEGORY.CONSUMABLE && isAvailable(def)
  );
  const consumablePool = SHOP_ITEM_POOL.filter(
    def => def.category === ITEM_CATEGORY.CONSUMABLE
  );

  const items = shuffle(mainPool).slice(0, mainCount);
  const consumables = shuffle(consumablePool).slice(0, consumableCount);

  items.forEach(def => shopState.seenItemIds.push(def.id));

  return { items, consumables };
}

/**
 * Attempts to buy an item. Validates the consumable-slot cap and
 * whether the player can afford it, then records the purchase in
 * shopState.inventory. Doesn't touch score directly — score lives in
 * main.js, not shopState — so the caller subtracts the returned price
 * from its own score variable on success.
 *
 * @param {string} itemId - id of the SHOP_ITEM_POOL entry to buy.
 * @param {number} level - current level, used to price the item.
 * @param {number} currentScore - the player's current score.
 * @returns {{ success: boolean, reason?: string, price?: number, item?: object }}
 *   on success: { success: true, price, item }. On failure:
 *   { success: false, reason: 'not_found' | 'consumable_slots_full' | 'insufficient_score' }.
 */
export function buyItem(itemId, level, currentScore) {
  const def = SHOP_ITEM_POOL.find(i => i.id === itemId);
  if (!def) return { success: false, reason: 'not_found' };

  if (def.category === ITEM_CATEGORY.CONSUMABLE && heldConsumableCount() >= MAX_CONSUMABLES_HELD) {
    return { success: false, reason: 'consumable_slots_full' };
  }

  const price = calculateItemPrice(def.basePrice, level);
  if (currentScore < price) {
    return { success: false, reason: 'insufficient_score' };
  }

  const existing = shopState.inventory.find(owned => owned.id === def.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    shopState.inventory.push({
      id: def.id,
      category: def.category,
      quantity: 1,
      purchasedAtLevel: level,
    });
  }

  return { success: true, price, item: def };
}

/**
 * Clears all shop state — owned items and the "already seen" list —
 * for a fresh run. Call from main.js's init() alongside resetBoons().
 *
 * @returns {void}
 */
export function resetShop() {
  shopState.inventory.length = 0;
  shopState.seenItemIds.length = 0;
}