// ============================================================
// BOON.JS — offer generation + pick tracking.
//
// Reads/writes boonState (resources/boon/) but owns none of the
// state itself. Offer generation is rarity-weighted (BOON_RARITY_WEIGHTS)
// and filters out gem-scoped boons for locked gems (gemUnlockState).
//
// NEW THIS ROUND — every activeBoons entry now carries a unique
// `pickId` (so ONE specific pick, out of possibly several copies of
// the same boon, can be targeted for removal later) and an
// `appliedEffect` slot (filled in by the caller right after
// applyBoonEffect() runs — see boon_effects.js). This is what makes
// the event system's "trade away a boon" / "lose a random boon"
// possible: reverseBoonEffect() + removeActiveBoon() together can
// undo ONE exact pick without touching anything else the player is
// holding.
// ============================================================

import { BOON_POOL, BOON_RARITY_WEIGHTS, BOON_RARITY } from '../resources/boon/boon.js';
import { boonState } from '../resources/boon/boon_state.js';
import { LEGENDARY_UNLOCK_LEVEL } from '../resources/constant/constants.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { progressionState } from '../resources/progression/progression.js';

// NEW — module-level counter for `pickId`. Reset alongside
// boonState.activeBoons in resetBoons().
let nextPickId = 1;

function timesPicked(boonId) {
  // NEW — an event-granted boon that bypasses maxOccurrences
  // (exemptFromOccurrenceCap: true — currently only Elite's win
  // reward) must NOT count against this boon's own cap for any
  // FUTURE normal pick — "doesn't count towards occurrences" per
  // design. Filtered out here so every caller of timesPicked() gets
  // this for free.
  return boonState.activeBoons.filter(b => b.id === boonId && !b.exemptFromOccurrenceCap).length;
}

/**
 * Respects the pick cap, gem-unlock status, AND the Legendary level
 * gate.
 *
 * EXPORTED THIS ROUND — the event system (gameplay/event.js) reuses
 * this exact gate for two things: finding a same-rarity replacement
 * for an Encounter trade, and checking whether ANY Legendary boon is
 * currently offerable before letting a Challenge event trigger at
 * all. Keeping this the single source of truth for "can this boon be
 * offered right now" avoids a second, parallel gate drifting out of
 * sync with this one somewhere in event.js.
 */
export function isBoonAvailable(def) {
  if (def.effect?.gem && !gemUnlockState.unlocked[def.effect.gem]) return false;
  if (def.rarity === BOON_RARITY.LEGENDARY && progressionState.level < LEGENDARY_UNLOCK_LEVEL) return false;
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
 * Equal-weight offer generation — see prior handoffs for the full
 * doc comment. Unchanged this round.
 */
export function generateEqualWeightBoonOffer(count = 5, extraFilter = () => true) {
  const available = BOON_POOL.filter(isBoonAvailable).filter(extraFilter);
  return shuffle(available).slice(0, count);
}

/**
 * Shared constructor for an activeBoons entry — used by BOTH
 * pickBoon() (normal, cap-respecting pick) and
 * grantBoonBypassingCap() (event rewards that ignore maxOccurrences
 * entirely). Pulled into one place so the SHAPE of an activeBoon
 * entry can never drift between the two call paths.
 *
 * `appliedEffect` starts null — the caller (main.js, or
 * gameplay/event.js) is responsible for setting
 * `activeBoon.appliedEffect = applyBoonEffect(def)` immediately after
 * calling pickBoon()/grantBoonBypassingCap(). It can't be filled in
 * HERE because applyBoonEffect() needs the activeBoon to already
 * exist first (frenzy's random-target selection, for instance, has
 * no dependency on the activeBoon record, but keeping the two calls
 * as a fixed two-step pattern everywhere is what makes the whole
 * reversal system reliable — see boon_effects.js's doc comment).
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
    pickId: nextPickId++,            // NEW — unique per-pick instance id
    id: def.id,
    pickedAtLevel: progressionState.level,
    data,
    exemptFromOccurrenceCap: exempt, // NEW
    appliedEffect: null,             // NEW — the caller fills this in right after applyBoonEffect()
  };
  boonState.activeBoons.push(activeBoon);
  return activeBoon;
}

/**
 * Records the player's pick in boonState. Does NOT apply the boon's
 * effect — see js/gameplay/boon_effects.js's applyBoonEffect(), called
 * separately by main.js right after this (and now expected to have
 * its return value attached: `activeBoon.appliedEffect = applyBoonEffect(def)`).
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
 * NEW — grants a boon exactly like pickBoon(), but skips
 * isBoonAvailable() ENTIRELY (no maxOccurrences check, no gem-unlock
 * check, no Legendary level gate), and the resulting entry is flagged
 * `exemptFromOccurrenceCap: true`, so it also never counts against
 * that SAME boon's cap for any future normal pick.
 *
 * Currently used for exactly one thing: Gem Elitist's win reward (2
 * random Epic boons, "not affected by boon occurrences nor does it
 * count towards occurrences" per design) — see
 * gameplay/event.js's resolveEliteOutcome(). Gem-unlock filtering is
 * still done by the CALLER (event.js only ever passes in ids from a
 * pool already filtered to unlocked gems) — this function trusts the
 * id it's given completely, on purpose, since "bypass everything" is
 * exactly what it's for.
 *
 * @param {string} boonId
 * @param {object} [data={}]
 * @returns {object|null} the new activeBoon entry, or null if boonId
 *   doesn't match any BOON_POOL entry at all.
 */
export function grantBoonBypassingCap(boonId, data = {}) {
  const def = BOON_POOL.find(b => b.id === boonId);
  if (!def) return null;
  return createActiveBoonEntry(def, data, true);
}

/**
 * NEW — removes one SPECIFIC pick from boonState.activeBoons by its
 * unique pickId (NOT by boon id — the player could hold several
 * copies of the same boon). Does NOT undo the pick's stat effects;
 * the caller must call boon_effects.js's reverseBoonEffect() on the
 * SAME entry FIRST (before removal — reversal reads the entry's
 * stored appliedEffect, which this function throws away).
 *
 * @param {number} pickId
 * @returns {object|null} the removed entry, or null if no entry with
 *   that pickId was found.
 */
export function removeActiveBoon(pickId) {
  const index = boonState.activeBoons.findIndex(b => b.pickId === pickId);
  if (index === -1) return null;
  const [removed] = boonState.activeBoons.splice(index, 1);
  return removed;
}

export function resetBoons() {
  boonState.activeBoons.length = 0;
  nextPickId = 1; // NEW — pickIds are per-run, same as everything else this resets
}