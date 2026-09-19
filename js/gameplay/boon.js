// ============================================================
// BOON.JS — offer generation + pick tracking.
//
// Reads/writes boonState (resources/boon/boonState.js) but owns none
// of the state itself — same split as board.js (logic) vs. a grid
// array (data), just for boons instead of the board.
// ============================================================

import { BOON_POOL } from '../resources/boon/boonDefinitions.js';
import { boonState } from '../resources/boon/boonState.js';
import { progressionState } from '../resources/progression/progression.js';

/**
 * How many times a boon definition has already been picked this run.
 *
 * @param {string} boonId - id of the BoonDefinition to check.
 * @returns {number} times it appears in boonState.activeBoons.
 */
function timesPicked(boonId) {
  return boonState.activeBoons.filter(b => b.id === boonId).length;
}

/**
 * Whether a boon definition can still be offered — false once it's
 * hit its maxOccurrences cap. null/undefined maxOccurrences means
 * unlimited (can always reappear, e.g. stacking small buffs).
 *
 * @param {object} def - a BOON_POOL entry.
 * @returns {boolean} true if it can still show up in an offer.
 */
function isBoonAvailable(def) {
  if (def.maxOccurrences == null) return true;
  return timesPicked(def.id) < def.maxOccurrences;
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
 * Generates a fresh set of boon choices for the player to pick from —
 * distinct definitions, respecting each boon's maxOccurrences cap.
 * This is the "system generates three boons" step; it doesn't touch
 * boonState itself — nothing is picked until pickBoon() is called.
 *
 * @param {number} [count=3] - how many choices to offer.
 * @returns {object[]} up to `count` BoonDefinition objects (fewer if
 *   the available pool has run dry).
 */
export function generateBoonOffer(count = 3) {
  const available = BOON_POOL.filter(isBoonAvailable);
  return shuffle(available).slice(0, count);
}

/**
 * Applies the player's choice: looks up the definition by id, records
 * it as an active boon, and returns the new instance so the caller
 * can react immediately if needed. This only tracks that the player
 * has the boon — applying its actual effect is up to the caller.
 *
 * @param {string} boonId - id of the chosen BoonDefinition.
 * @param {object} [data={}] - free-form per-instance data (e.g. a
 *   slot boon's chosen board position).
 * @returns {object|null} the new ActiveBoon, or null if boonId
 *   doesn't match any definition or is no longer available.
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

/**
 * Clears all active boons. Call from main.js's init() so "start over"
 * begins a run with no boons picked.
 *
 * @returns {void}
 */
export function resetBoons() {
  boonState.activeBoons.length = 0;
}


// TODO
/*
Notes on the two "take note" cases
Infinite boons (maxOccurrences: null) can be re-offered and re-picked indefinitely — good fit for stacking small buffs like Diamond Windfall.
Capped boons (maxOccurrences: 1 or 2) stop showing up in generateBoonOffer() once picked that many times — isBoonAvailable() checks this by counting matching entries already in boonState.activeBoons, so there's no separate counter to keep in sync.

What's left for you
Wiring generateBoonOffer() into a trigger point (the obvious one is right after advanceLevel() in main.js's level-up block) and a choice UI.
Calling resetBoons() from init() alongside resetProgression(1).
Reading boonState.activeBoons wherever you implement the actual effects (score.js for the scoring-related ones; for TILE_BASIC/TILE_EXPANDED boons, call constructTile() from js/gameplay/tiles.js with the boon's effect.tileShape rather than writing separate placement logic — that's the intended hookup between the boon and tile systems).
*/