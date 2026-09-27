// ============================================================
// CUSTOMER_SERVICE.JS (gameplay) — the shop's Customer Service
// section: Curse Removal Service and Limited Edition Boons Sale
// Service. Per design, the player may use AT MOST ONE of these two
// per shop visit — main.js enforces that by checking
// customerServiceState.usedThisVisit before allowing either to be
// clicked at all (both this file's actions set it to true once used).
// ============================================================

import { customerServiceState } from '../resources/shop/customer_service_state.js';
import { BOON_POOL, SHOP_ONLY_BOON_IDS } from '../resources/boon/boon.js';
import { isBoonAvailable, isRarityAllowed } from './boon.js';
import { curseState } from '../resources/curse/curse_state.js';
import { reverseBoonEffect } from './boon_effects.js';
import { removeActiveCurse } from './curse.js';

// Curse Removal Service pricing — a PERCENT of shopEntryScore
// (main.js's existing "score at shop-open" snapshot, same convention
// every other shop price already uses), keyed by how many times this
// service has EVER been used this run (0-indexed): 25% the first
// time, 50% the second, 75% every time after that.
const CURSE_REMOVAL_PRICE_TIERS = [0.25, 0.50, 0.75];

/**
 * Price for using the Curse Removal Service right now, based on how
 * many times it's been used so far THIS RUN.
 *
 * @param {number} shopEntryScore
 * @returns {number} whole-number score cost.
 */
export function calculateCurseRemovalPrice(shopEntryScore) {
  const tierIndex = Math.min(customerServiceState.curseRemovalUseCount, CURSE_REMOVAL_PRICE_TIERS.length - 1);
  return Math.round(shopEntryScore * CURSE_REMOVAL_PRICE_TIERS[tierIndex]);
}

/**
 * Removes one specific active curse (by its activeCurses pickId) via
 * the Customer Service — reverses its effect first (same
 * appliedEffect/reverseBoonEffect pattern a boon removal already
 * follows), THEN removes it from curseState. Marks the service as
 * used for the rest of this visit and bumps the run-wide use count
 * (so the NEXT use, if any, prices at the next tier up).
 *
 * The caller (main.js) is responsible for deducting the price from
 * score — this function only touches curse state + the service's own
 * bookkeeping, same "logic file decides what CAN happen, main.js
 * decides what actually happens to score" split used everywhere else.
 *
 * @param {number} pickId - the activeCurses entry's pickId to remove.
 * @returns {boolean} true if a curse was actually found and removed.
 */
export function removeCurseViaService(pickId) {
  const activeCurse = curseState.activeCurses.find(c => c.pickId === pickId);
  if (!activeCurse) return false;

  reverseBoonEffect(activeCurse);
  removeActiveCurse(pickId);

  customerServiceState.curseRemovalUseCount += 1;
  customerServiceState.usedThisVisit = true;
  return true;
}

/**
 * Rolls which ONE shop-only boon (if any) the "Limited Edition Boons
 * Sale" service offers this visit. Call once, right when the shop
 * opens (alongside rollBoonShopOffer()/rollConsumableShopOffer()).
 * Sets customerServiceState.limitedEditionBoonId to null if nothing
 * in SHOP_ONLY_BOON_IDS is currently available (every entry already
 * maxed out) — main.js shows "Out Of Service" in that case.
 *
 * @returns {void}
 */
export function rollLimitedEditionBoonOffer(clearedLevel) {
  const available = BOON_POOL.filter(def =>
    SHOP_ONLY_BOON_IDS.has(def.id) &&
    isBoonAvailable(def) &&
    isRarityAllowed(def, 'shop', clearedLevel)
  );
  customerServiceState.limitedEditionBoonId = available.length > 0
    ? available[Math.floor(Math.random() * available.length)].id
    : null;
}

/**
 * Marks the Customer Service section as used for the rest of this
 * visit — called by main.js right after a successful Limited Edition
 * Boons Sale purchase (removeCurseViaService() already does this
 * itself for the curse-removal path).
 *
 * @returns {void}
 */
export function markCustomerServiceUsed() {
  customerServiceState.usedThisVisit = true;
}

/**
 * Resets the PER-VISIT fields. Call every time the shop opens, right
 * before rollLimitedEditionBoonOffer() re-rolls this visit's offer.
 *
 * @returns {void}
 */
export function resetCustomerServiceVisit() {
  customerServiceState.usedThisVisit = false;
  customerServiceState.limitedEditionBoonId = null;
}

/**
 * Resets EVERYTHING, including the run-wide curse-removal use count.
 * Call from main.js's init() ("start over"), alongside every other
 * resetX() call.
 *
 * @returns {void}
 */
export function resetCustomerService() {
  customerServiceState.curseRemovalUseCount = 0;
  customerServiceState.usedThisVisit = false;
  customerServiceState.limitedEditionBoonId = null;
}