// ============================================================
// GEM_BASE.JS — reads/writes gem_base_state.js's per-gem deltas.
//
// Everything else in the game asks THIS file for a gem's actual base
// score/multiplier/value — never reads DEFAULT_GEM_BASE_SCORE or
// gemBaseState directly, so the "default + delta" math lives in one
// place.
// ============================================================

import { ALL_GEM_IDS } from '../resources/constant/constants.js';
import { DEFAULT_GEM_BASE_SCORE, DEFAULT_GEM_BASE_MULTIPLIER } from '../resources/base%20value/base_score.js';
import { gemBaseState } from '../resources/base%20value/gem_base_state.js';

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
  return DEFAULT_GEM_BASE_MULTIPLIER + (gemBaseState.perGem[gemId]?.multiplierBonus || 0);
}

export function getGemBaseValue(gemId) {
  return getGemBaseScore(gemId) * getGemBaseMultiplier(gemId);
}