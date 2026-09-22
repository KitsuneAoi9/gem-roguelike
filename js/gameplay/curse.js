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
// ============================================================

import { CURSE_POOL } from '../resources/curse/curse.js';
import { curseState } from '../resources/curse/curse_state.js';
import { progressionState } from '../resources/progression/progression.js';

let nextCursePickId = 1;

/**
 * Grants one curse by id, unconditionally (no availability gate at
 * all — curses currently have no maxOccurrences/unlock concept).
 *
 * @param {string} curseId
 * @returns {object|null} the new activeCurse entry, or null if
 *   curseId doesn't match any CURSE_POOL entry.
 */
export function grantCurse(curseId) {
  const def = CURSE_POOL.find(c => c.id === curseId);
  if (!def) return null;

  const activeCurse = {
    pickId: nextCursePickId++,
    id: def.id,
    pickedAtLevel: progressionState.level,
    appliedEffect: null, // caller fills this in right after applyBoonEffect()
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