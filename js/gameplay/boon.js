// ============================================================
// BOON.JS — offer generation + pick tracking.
//
// NEW THIS ROUND — generateBoonOffer()/generateEqualWeightBoonOffer()
// now also exclude SHOP_ONLY_BOON_IDS (Booner, VIP Membership Card),
// alongside the existing 'perpetual_boon' and EVENT_ONLY_BOON_IDS
// exclusions. Shop-only boons are ONLY ever granted directly by
// gameplay/customer_service.js's "Limited Edition Boons Sale" service.
// ============================================================

import { BOON_POOL, BOON_RARITY_WEIGHTS, BOON_RARITY, EVENT_ONLY_BOON_IDS, SHOP_ONLY_BOON_IDS } from '../resources/boon/boon.js';
import { boonState } from '../resources/boon/boon_state.js';
import { LEGENDARY_UNLOCK_LEVEL } from '../resources/constant/constants.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { progressionState } from '../resources/progression/progression.js';

// Module-level counter for `pickId`. Reset alongside
// boonState.activeBoons in resetBoons().
let nextPickId = 1;

function timesPicked(boonId) {
  // An event-granted boon that bypasses maxOccurrences
  // (exemptFromOccurrenceCap: true — currently only Elite's win
  // reward) must NOT count against this boon's own cap for any
  // FUTURE normal pick — filtered out here so every caller of
  // timesPicked() gets this for free.
  return boonState.activeBoons.filter(b => b.id === boonId && !b.exemptFromOccurrenceCap).length;
}

/**
 * Respects the pick cap, gem-unlock status, AND the Legendary level
 * gate.
 *
 * The event system (gameplay/event.js) reuses this exact gate for two
 * things: finding a same-rarity replacement for an Encounter trade,
 * and checking whether ANY Legendary boon is currently offerable
 * before letting a Challenge event trigger at all.
 */
export function isBoonAvailable(def) {
  if (def.effect?.gem && !gemUnlockState.unlocked[def.effect.gem]) return false;
  if (def.rarity === BOON_RARITY.LEGENDARY && progressionState.level < LEGENDARY_UNLOCK_LEVEL) return false;
  if (def.maxOccurrences == null) return true;
  return timesPicked(def.id) < def.maxOccurrences;
}

/**
 * True if the player currently holds AT LEAST ONE pick of the given
 * boon id, regardless of how many copies or which pickId.
 *
 * @param {string} boonId
 * @returns {boolean}
 */
export function isBoonActive(boonId) {
  return boonState.activeBoons.some(b => b.id === boonId);
}

/**
 * How many copies of a given boon id the player currently holds.
 * Same underlying data as isBoonActive(), just a count instead of a
 * boolean — used wherever a boon's effect scales per copy (Booner's
 * stacking bonus-offer chance, Perpetual Boon's per-level %, etc.).
 *
 * @param {string} boonId
 * @returns {number}
 */
export function countActiveBoon(boonId) {
  return boonState.activeBoons.filter(b => b.id === boonId).length;
}

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Weighted rarity roll off BOON_RARITY_WEIGHTS. A future Luck stat adjusts these weights. */
function rollRarity() {
  const roll = Math.random();
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(BOON_RARITY_WEIGHTS)) {
    cumulative += weight;
    if (roll < cumulative) return rarity;
  }
  return 'common';
}

/** Every id that must never appear through the normal offer pools — shared by both generators below. */
function isExcludedFromNormalOffers(def) {
  return def.id === 'perpetual_boon' || EVENT_ONLY_BOON_IDS.has(def.id) || SHOP_ONLY_BOON_IDS.has(def.id);
}

/**
 * Generates a fresh set of boon choices, rarity-weighted per
 * BOON_RARITY_WEIGHTS rather than a flat uniform draw.
 *
 * NEW — Perpetual Boon is excluded from the normal candidate pool
 * entirely (see the `available` filter below), and only ever gets
 * added at the very end, as a last-resort filler, if the pool
 * genuinely couldn't fill every slot with a real, distinct boon.
 *
 * CHANGED THIS ROUND — the `available` filter now also excludes
 * EVENT_ONLY_BOON_IDS, alongside the existing 'perpetual_boon' exclusion.
 *
 * @param {number} [count=3]
 * @returns {object[]}
 */
export function generateBoonOffer(count = 3) {
  const available = BOON_POOL.filter(def => !isExcludedFromNormalOffers(def)).filter(isBoonAvailable);
  const offer = [];
  const usedIds = new Set();

  let attempts = 0;
  while (offer.length < count && attempts < count * 50) {
    attempts++;
    const rarity = rollRarity();
    const candidates = available.filter(def => def.rarity === rarity && !usedIds.has(def.id));
    if (candidates.length === 0) continue;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    offer.push(pick);
    usedIds.add(pick.id);
  }

  if (offer.length < count) {
    const remaining = shuffle(available.filter(def => !usedIds.has(def.id)));
    for (const def of remaining) {
      if (offer.length >= count) break;
      offer.push(def);
    }
  }

  // NEW — Perpetual Boon fallback: if even after the two passes above
  // there still aren't enough DISTINCT real boons left to fill every
  // slot (every other offerable boon is already exhausted/maxed),
  // pad whatever's left with Perpetual Boon. Its own maxOccurrences
  // is Unlimited, so this can never itself run dry — it's the
  // guaranteed last resort the level-up screen always has something
  // to show.
  if (offer.length < count) {
    const perpetualDef = BOON_POOL.find(def => def.id === 'perpetual_boon');
    while (offer.length < count && perpetualDef) {
      offer.push(perpetualDef);
    }
  }

  return offer;
}

/**
 * Equal-weight offer generation for the shop.
 */
export function generateEqualWeightBoonOffer(count = 5, extraFilter = () => true) {
  const available = BOON_POOL
    .filter(def => !isExcludedFromNormalOffers(def))
    .filter(isBoonAvailable)
    .filter(extraFilter);
  return shuffle(available).slice(0, count);
}

/**
 * Shared constructor for an activeBoons entry — used by BOTH
 * pickBoon() (normal, cap-respecting pick) and
 * grantBoonBypassingCap() (event rewards that ignore maxOccurrences
 * entirely). Pulled into one place so the SHAPE of an activeBoon
 * entry can never drift between the two call paths.
 *
 * @param {object} def - a BOON_POOL entry.
 * @param {object} data - free-form extra data for this pick (unused
 *   by anything currently, kept for forward compatibility).
 * @param {boolean} exempt - true for an event-granted boon that
 *   should never count toward (or be blocked by) `def.maxOccurrences`.
 * @returns {object} the newly-created activeBoon entry (already
 *   pushed onto boonState.activeBoons).
 */
function createActiveBoonEntry(def, data, exempt) {
  const activeBoon = {
    pickId: nextPickId++,
    id: def.id,
    pickedAtLevel: progressionState.level,
    data,
    exemptFromOccurrenceCap: exempt,
    appliedEffect: null,
  };
  boonState.activeBoons.push(activeBoon);
  return activeBoon;
}

/**
 * Records the player's pick in boonState. Does NOT apply the boon's
 * effect — see js/gameplay/boon_effects.js's applyBoonEffect(), called
 * separately by main.js right after this.
 *
 * @param {string} boonId
 * @param {object} [data={}]
 * @returns {object|null}
 */
export function pickBoon(boonId, data = {}) {
  const def = BOON_POOL.find(b => b.id === boonId);
  if (!def || !isBoonAvailable(def)) return null;
  return createActiveBoonEntry(def, data, false);
}

/**
 * Grants a boon exactly like pickBoon(), but skips isBoonAvailable()
 * ENTIRELY, and the resulting entry is flagged
 * `exemptFromOccurrenceCap: true`.
 *
 * @param {string} boonId
 * @param {object} [data={}]
 * @returns {object|null}
 */
export function grantBoonBypassingCap(boonId, data = {}) {
  const def = BOON_POOL.find(b => b.id === boonId);
  if (!def) return null;
  return createActiveBoonEntry(def, data, true);
}

/**
 * Removes one SPECIFIC pick from boonState.activeBoons by its unique
 * pickId (NOT by boon id). Does NOT undo the pick's stat effects; the
 * caller must call boon_effects.js's reverseBoonEffect() on the SAME
 * entry FIRST.
 *
 * @param {number} pickId
 * @returns {object|null}
 */
export function removeActiveBoon(pickId) {
  const index = boonState.activeBoons.findIndex(b => b.pickId === pickId);
  if (index === -1) return null;
  const [removed] = boonState.activeBoons.splice(index, 1);
  return removed;
}

export function resetBoons() {
  boonState.activeBoons.length = 0;
  nextPickId = 1;
}