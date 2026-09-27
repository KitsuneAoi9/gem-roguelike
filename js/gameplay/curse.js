// ============================================================
// CURSE.JS (gameplay) — grant/remove tracking for active curses.
//
// Mirrors boon.js's pickBoon()/removeActiveBoon() pattern exactly,
// scoped to curseState instead of boonState. Does NOT apply or
// reverse a curse's actual effect itself — that's still
// boon_effects.js's applyBoonEffect()/reverseBoonEffect(), called by
// the SAME two-step pattern every boon grant uses:
//   const activeCurse = grantCurse(curseId);
//   activeCurse.appliedEffect = applyBoonEffect(curseDef);
//
// NEW THIS ROUND — grantCurse() takes an optional `data` object,
// merged directly onto the new activeCurse entry. This is how
// Decaying Birthstone's `trackedGemId`/`clearCount` and Petrified's
// `lockedGem` get attached at grant time (mirrors boon.js's own
// pickBoon(boonId, data) shape). Neither curse is currently GRANTED
// anywhere in the game yet (see resources/curse/curse.js's file
// header) — this file only builds the supporting machinery so a
// future event can call e.g.
//   grantCurse('decaying_birthstone', { trackedGemId: someGemId, clearCount: 0 })
// and have everything else (recordDecayingBirthstoneActivity(),
// gem_base.js's Petrified check) already work correctly.
// ============================================================

import { CURSE_POOL } from '../resources/curse/curse.js';
import { curseState } from '../resources/curse/curse_state.js';
import { progressionState } from '../resources/progression/progression.js';
import { GEM_DEFINITIONS } from '../resources/constant/constants.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { countGemClears } from './score.js';

let nextCursePickId = 1;

/**
 * Picks one random UNLOCKED gem id — the same "a random gem" rule
 * every other random-gem-target boon/curse/event in the game uses.
 * Duplicated here in a tiny standalone form (rather than importing it
 * from gameplay/event.js) specifically to avoid a curse.js <-> event.js
 * import cycle — event.js already imports CURSE_POOL from the
 * resources side of this file's pair.
 *
 * @returns {string}
 */
export function pickRandomGemIdForCurse() {
  const candidates = GEM_DEFINITIONS.map(g => g.id).filter(id => gemUnlockState.unlocked[id]);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Grants one curse by id, unconditionally (no availability gate at
 * all — curses currently have no maxOccurrences/unlock concept).
 *
 * @param {string} curseId
 * @param {object} [data] - NEW — extra fields merged directly onto the
 *   new activeCurse entry (e.g. `{ trackedGemId, clearCount: 0 }` for
 *   Decaying Birthstone, `{ lockedGem }` for Petrified). Only a
 *   couple of curses need this, so it's kept as a generic spread
 *   rather than adding curse-specific named fields to every entry.
 *   The caller is responsible for NOT passing any of the base field
 *   names (pickId/id/pickedAtLevel/appliedEffect) in here — those
 *   always come from this function itself.
 * @returns {object|null} the new activeCurse entry, or null if
 *   curseId doesn't match any CURSE_POOL entry.
 */
export function grantCurse(curseId, data = {}) {
  const def = CURSE_POOL.find(c => c.id === curseId);
  if (!def) return null;

  const activeCurse = {
    pickId: nextCursePickId++,
    id: def.id,
    pickedAtLevel: progressionState.level,
    appliedEffect: null, // caller fills this in right after applyBoonEffect()
    ...data, // NEW — see doc comment above
  };
  curseState.activeCurses.push(activeCurse);
  return activeCurse;
}

/**
 * Removes one specific curse pick by its pickId. Does NOT reverse its
 * effect — call boon_effects.js's reverseBoonEffect() on the same
 * entry FIRST, same ordering rule removeActiveBoon() follows.
 *
 * @param {number} pickId
 * @returns {object|null}
 */
export function removeActiveCurse(pickId) {
  const index = curseState.activeCurses.findIndex(c => c.pickId === pickId);
  if (index === -1) return null;
  const [removed] = curseState.activeCurses.splice(index, 1);
  return removed;
}

/** Clears all curses for a fresh run. Call from main.js's init(). */
export function resetCurses() {
  curseState.activeCurses.length = 0;
  nextCursePickId = 1;
}

/**
 * Every currently-active curse whose effect.kind matches `kind`,
 * returned as their FULL CURSE_POOL defs (not the lighter
 * activeCurses entries) — a caller needs the def's own fields
 * (effect.percent, name, description) to actually DO anything with
 * it. Used by main.js to ask "is a recurring/triggered curse of THIS
 * shape currently active" (right now, the Crystallized Parasite's
 * per-level score drain) without reaching into curseState directly
 * or knowing its internal shape.
 *
 * @param {string} kind - an effect.kind value, e.g. 'parasite_score_drain'.
 * @returns {object[]} matching CURSE_POOL defs, one per active pick.
 */
export function getActiveCurseDefsByKind(kind) {
  return curseState.activeCurses
    .map(activeCurse => CURSE_POOL.find(c => c.id === activeCurse.id))
    .filter(def => def && def.effect?.kind === kind);
}

/**
 * NEW — call this once per cascade step (same call sites as
 * gameplay/event.js's recordEliteGemActivity()) while ANY Decaying
 * Birthstone curse is active. Adds to each such curse's OWN running
 * clear count — tracked independently per pick, per the design: two
 * copies targeting the SAME gem need 200 clears between them (each
 * pick keeps its own counter and its own 100-clear threshold; they
 * just happen to both be counting the same gem type), while a
 * DIFFERENT gem picked by a second copy is tracked completely
 * separately and reaches its own threshold independently.
 *
 * Safe to call unconditionally, every cascade step, regardless of
 * whether any Decaying Birthstone is actually active — it just does
 * nothing (returns an empty array) if none are.
 *
 * @param {{gemType:number,length:number}[]} matchedGroups
 * @param {{gemType:number,row:number,col:number}[]} incidentalCells
 * @returns {object[]} every activeCurse entry that just crossed its
 *   own threshold THIS call (normally empty — usually at most one).
 */
export function recordDecayingBirthstoneActivity(matchedGroups, incidentalCells) {
  const justBecameLethal = [];

  curseState.activeCurses.forEach(activeCurse => {
    const def = CURSE_POOL.find(c => c.id === activeCurse.id);
    if (!def || def.effect?.kind !== 'lethal_gem_clear') return;

    // Safety net — if a curse of this kind was ever somehow granted
    // without the trackedGemId/clearCount data, don't crash; just
    // treat it as tracking nothing (0 clears) rather than throwing.
    if (activeCurse.clearCount == null) activeCurse.clearCount = 0;
    if (!activeCurse.trackedGemId) return;

    const clearedThisStep = countGemClears(activeCurse.trackedGemId, matchedGroups, incidentalCells);
    if (clearedThisStep <= 0) return;

    activeCurse.clearCount += clearedThisStep;
    if (activeCurse.clearCount >= def.effect.threshold) {
      justBecameLethal.push(activeCurse);
    }
  });

  return justBecameLethal;
}