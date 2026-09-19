// ============================================================
// BOON.JS — offer generation + pick tracking.
//
// Reads/writes boonState (resources/boon/) but owns none of the
// state itself. Offer generation is rarity-weighted (BOON_RARITY_WEIGHTS)
// and filters out gem-scoped boons for locked gems (gemUnlockState).
// ============================================================

import { BOON_POOL, BOON_RARITY_WEIGHTS } from '../resources/boon/boon.js';
import { boonState } from '../resources/boon/boon_state.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { progressionState } from '../resources/progression/progression.js';

function timesPicked(boonId) {
  return boonState.activeBoons.filter(b => b.id === boonId).length;
}

/** Respects the pick cap AND, for gem-scoped boons, whether that gem is unlocked. */
function isBoonAvailable(def) {
  if (def.effect?.gem && !gemUnlockState.unlocked[def.effect.gem]) return false;
  if (def.maxOccurrences == null) return true;
  return timesPicked(def.id) < def.maxOccurrences;
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
  return 'common'; // fallback if weights don't sum to exactly 1
}

/**
 * Generates a fresh set of boon choices, rarity-weighted per
 * BOON_RARITY_WEIGHTS rather than a flat uniform draw.
 *
 * @param {number} [count=3]
 * @returns {object[]}
 */
export function generateBoonOffer(count = 3) {
  const available = BOON_POOL.filter(isBoonAvailable);
  const offer = [];
  const usedIds = new Set();

  // roll rarity, then pick randomly within that rarity
  let attempts = 0;
  while (offer.length < count && attempts < count * 50) {
    attempts++;
    const rarity = rollRarity();
    const candidates = available.filter(def => def.rarity === rarity && !usedIds.has(def.id));
    if (candidates.length === 0) continue; // unlucky/empty tier — reroll
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    offer.push(pick);
    usedIds.add(pick.id);
  }

  // pool nearly exhausted — top up uniformly so the dialog isn't short a card
  if (offer.length < count) {
    const remaining = shuffle(available.filter(def => !usedIds.has(def.id)));
    for (const def of remaining) {
      if (offer.length >= count) break;
      offer.push(def);
    }
  }

  return offer;
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

  const activeBoon = {
    id: def.id,
    pickedAtLevel: progressionState.level,
    data,
  };
  boonState.activeBoons.push(activeBoon);
  return activeBoon;
}

export function resetBoons() {
  boonState.activeBoons.length = 0;
}