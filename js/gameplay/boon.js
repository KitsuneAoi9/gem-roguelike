// ============================================================
// BOON.JS — offer generation + pick tracking.
//
// CHANGED THIS ROUND — rarity level-gating moved OUT of
// isBoonAvailable() into its own isRarityAllowed(). Reason: the old
// gate read progressionState.level, which is WRONG once several
// queued level-up rewards are processed one after another (the
// current level is already e.g. 11 while we're still handing out
// level 6's reward). Every offer generator now takes an explicit
// `clearedLevel` — the level that reward is FOR.
// ============================================================

import { BOON_POOL, BOON_RARITY_WEIGHTS, EVENT_ONLY_BOON_IDS, SHOP_ONLY_BOON_IDS } from '../resources/boon/boon.js';
import { boonState } from '../resources/boon/boon_state.js';
import { BOON_RARITY_MIN_CLEARED_LEVEL } from '../resources/constant/constants.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { progressionState } from '../resources/progression/progression.js';

// Module-level counter for `pickId`. Reset alongside
// boonState.activeBoons in resetBoons().
let nextPickId = 1;

function timesPicked(boonId) {
  // Event-granted boons flagged exemptFromOccurrenceCap never count
  // against a boon's own cap for any future normal pick.
  return boonState.activeBoons.filter(b => b.id === boonId && !b.exemptFromOccurrenceCap).length;
}

/**
 * Respects the pick cap and gem-unlock status.
 *
 * NOTE — the Legendary level gate that used to live here is GONE on
 * purpose. Rarity gating now lives in isRarityAllowed() below, since
 * it needs to know WHICH level a reward is for (this function is also
 * called by pickBoon(), which must never re-reject a boon the offer
 * generator already allowed).
 */
export function isBoonAvailable(def) {
  if (def.effect?.gem && !gemUnlockState.unlocked[def.effect.gem]) return false;
  if (def.maxOccurrences == null) return true;
  return timesPicked(def.id) < def.maxOccurrences;
}

/**
 * NEW — whether a boon's rarity is unlocked yet for a given reward
 * source and cleared level.
 *
 * @param {object} def - a BOON_POOL entry.
 * @param {'levelUp'|'event'|'shop'} source - which settings row to read.
 * @param {number} clearedLevel - the level this reward is FOR.
 * @returns {boolean}
 */
export function isRarityAllowed(def, source, clearedLevel) {
  // Unknown source/rarity falls back to "no restriction" (level 1)
  // rather than silently hiding the boon forever.
  const minLevel = BOON_RARITY_MIN_CLEARED_LEVEL[source]?.[def.rarity] ?? 1;
  return clearedLevel >= minLevel;
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
 * BOON_RARITY_WEIGHTS.
 *
 * CHANGED THIS ROUND — takes `clearedLevel` (the level this reward is
 * for) and drops any boon whose rarity isn't unlocked yet for
 * 'levelUp' offers. A locked rarity that gets rolled just finds no
 * candidates and rerolls (the existing `continue` below), so the
 * player never sees a short offer.
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
 * @param {number} [clearedLevel] - defaults to the last level cleared
 *   (progressionState.level - 1), which is correct for callers that
 *   run right after a clear (e.g. Lost Miner's absorb).
 * @returns {object[]}
 */
export function generateBoonOffer(count = 3, clearedLevel = progressionState.level - 1) {
  // Three filters stacked: not excluded-by-design, still under its
  // pick cap/unlocked gem, and its rarity is unlocked for this level.
  const available = BOON_POOL
    .filter(def => !isExcludedFromNormalOffers(def))
    .filter(isBoonAvailable)
    .filter(def => isRarityAllowed(def, 'levelUp', clearedLevel));

  const offer = [];
  const usedIds = new Set();

  let attempts = 0;
  while (offer.length < count && attempts < count * 50) {
    attempts++;
    const rarity = rollRarity();
    const candidates = available.filter(def => def.rarity === rarity && !usedIds.has(def.id));
    if (candidates.length === 0) continue; // locked/empty rarity — just reroll
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    offer.push(pick);
    usedIds.add(pick.id);
  }

  // Top-up pass: uniform fill from whatever is still allowed.
  if (offer.length < count) {
    const remaining = shuffle(available.filter(def => !usedIds.has(def.id)));
    for (const def of remaining) {
      if (offer.length >= count) break;
      offer.push(def);
    }
  }

  // Last-resort filler: Perpetual Boon (unlimited, never runs dry).
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
 *
 * CHANGED THIS ROUND — takes `clearedLevel` and applies the 'shop'
 * settings row of BOON_RARITY_MIN_CLEARED_LEVEL.
 *
 * @param {number} [count=5]
 * @param {(def: object) => boolean} [extraFilter]
 * @param {number} [clearedLevel] - level whose shop this is.
 * @returns {object[]}
 */
export function generateEqualWeightBoonOffer(
  count = 5,
  extraFilter = () => true,
  clearedLevel = progressionState.level - 1
) {
  const available = BOON_POOL
    .filter(def => !isExcludedFromNormalOffers(def))
    .filter(isBoonAvailable)
    .filter(def => isRarityAllowed(def, 'shop', clearedLevel))
    .filter(extraFilter);
  return shuffle(available).slice(0, count);
}

/**
 * Shared constructor for an activeBoons entry.
 *
 * @param {object} def
 * @param {object} data
 * @param {boolean} exempt
 * @returns {object}
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
 * Records the player's pick in boonState. Does NOT apply the effect.
 * Deliberately does NOT check rarity gates — the offer generator
 * already did, and re-checking here against the wrong "current level"
 * would wrongly reject queued rewards.
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
 * Grants a boon like pickBoon(), skipping isBoonAvailable() entirely,
 * flagged exemptFromOccurrenceCap.
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
 * Removes one SPECIFIC pick by pickId. Caller must call
 * reverseBoonEffect() on the same entry FIRST.
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