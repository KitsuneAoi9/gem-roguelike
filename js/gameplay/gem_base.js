// ============================================================
// GEM_BASE.JS — reads/writes gem_base_state.js's per-gem deltas.
//
// Everything else in the game asks THIS file for a gem's actual base
// score/multiplier/value — never reads DEFAULT_GEM_BASE_SCORE or
// gemBaseState directly, so the "default + delta" math lives in one
// place.
//
// NEW THIS ROUND — the Petrified curse. getGemBaseMultiplier() now
// checks curseState directly (a resources-only import, no functions
// needed from curse.js) for an active 'gem_multiplier_lock' curse
// targeting the requested gem. If one is active, the multiplier reads
// as a flat 0 NO MATTER what gemBaseState's delta says — this is a
// read-time override, not a one-time zeroing. The underlying delta
// bucket keeps accumulating normally underneath (any further
// multiplier boon on this gem still runs applyBoonEffect()/
// reverseBoonEffect() exactly as normal, since board_effects.js has no
// idea this lock exists) — it just has no VISIBLE effect for as long
// as the lock holds, and resurfaces automatically the moment the lock
// is ever lifted (there's currently no way to remove a curse, so this
// is mostly theoretical today, but it's the correct, simplest shape:
// one `if` at the read site, instead of trying to intercept and block
// every possible write site).
// ============================================================

import { ALL_GEM_IDS } from '../resources/constant/constants.js';
import { DEFAULT_GEM_BASE_SCORE, DEFAULT_GEM_BASE_MULTIPLIER } from '../resources/base%20value/base_score.js';
import { gemBaseState } from '../resources/base%20value/gem_base_state.js';
import { curseState } from '../resources/curse/curse_state.js';
import { CURSE_POOL } from '../resources/curse/curse.js';

/** Rebuilds gemBaseState with a zeroed delta for every gem id (active + future/locked). */
export function resetGemBaseState() {
  gemBaseState.perGem = {};
  ALL_GEM_IDS.forEach(id => {
    gemBaseState.perGem[id] = { scoreBonus: 0, multiplierBonus: 0 };
  });
}

export function getGemBaseScore(gemId) {
  return DEFAULT_GEM_BASE_SCORE + (gemBaseState.perGem[gemId]?.scoreBonus || 0);
}

export function getGemBaseMultiplier(gemId) {
  // NEW — Petrified: is ANY currently-active curse a 'gem_multiplier_lock'
  // targeting exactly this gem? If so, short-circuit to 0 regardless of
  // whatever gemBaseState.perGem[gemId].multiplierBonus currently holds.
  const isLocked = curseState.activeCurses.some(activeCurse => {
    const def = CURSE_POOL.find(c => c.id === activeCurse.id);
    return def?.effect?.kind === 'gem_multiplier_lock' && activeCurse.lockedGem === gemId;
  });
  if (isLocked) return 0;

  return DEFAULT_GEM_BASE_MULTIPLIER + (gemBaseState.perGem[gemId]?.multiplierBonus || 0);
}

export function getGemBaseValue(gemId) {
  return getGemBaseScore(gemId) * getGemBaseMultiplier(gemId);
}