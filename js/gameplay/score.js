// ============================================================
// SCORE.JS — turns cleared cells into a final score for one cascade
// step, following the scoring design table + boon effects.
//
// Pipeline per cascade step:
//   1. Each matched group: gemBaseValue x length x sizeMultiplier
//   2. Each incidental (blast-chained) cell: one flat gemBaseValue
//   3. Sum scaled by the cascade combo multiplier
//   4. Affinity + Frenzy added flat
//   5. Global multiplier applied, THEN global flat bonus added
//
// Negative results are allowed — see handoff Gotchas.
// ============================================================

import { MATCH_BASE_MULTIPLIER, CASCADE_BASE_MULTIPLIER, CASCADE_COMBO_STEP } from '../resources/base%20value/base_score.js';
import { GEM_DEFINITIONS } from '../resources/constant/constants.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import { getGemBaseValue } from './gem_base.js';

/** 5+ all reuse the 5-tier value — no separate tier past 5. */
function getMatchSizeMultiplier(length) {
  const tier = length >= 5 ? 5 : length;
  return MATCH_BASE_MULTIPLIER[tier] ?? MATCH_BASE_MULTIPLIER[3];
}

/** Numeric board gemType -> gem id string. */
function gemIdForType(gemType) {
  return GEM_DEFINITIONS[gemType]?.id;
}

/**
 * Cascade combo multiplier. comboCount 1 -> 1x, 2 -> 1.5x, 3 -> 2x, etc.
 *
 * @param {number} comboCount
 * @returns {number}
 */
export function getComboMultiplier(comboCount) {
  return CASCADE_BASE_MULTIPLIER + (comboCount - 1) * CASCADE_COMBO_STEP;
}

function affinityBonusFor(gemId) {
  return boonEffectState.affinityBonus[gemId] || 0;
}

function frenzyAdjustmentFor(gemId) {
  let total = 0;
  for (const pick of boonEffectState.frenzyPicks) {
    total += pick.gemId === gemId ? pick.bonus : pick.penalty;
  }
  return total;
}

/**
 * Scores one cascade step (one resolveMatches() pass, or a Hypercube
 * activation treated as one oversized group).
 *
 * @param {{
 *   matchedGroups: { gemType: number, length: number }[],
 *   incidentalCells: { gemType: number, row: number, col: number }[],
 *   comboCount: number,
 * }} step
 * @returns {number} whole-number score (can be negative).
 */
export function calculateCascadeStepScore({ matchedGroups, incidentalCells, comboCount }) {
  let rawScore = 0;
  let affinityTotal = 0;
  let frenzyTotal = 0;

  for (const group of matchedGroups) {
    const gemId = gemIdForType(group.gemType);
    rawScore += getGemBaseValue(gemId) * group.length * getMatchSizeMultiplier(group.length);
    affinityTotal += affinityBonusFor(gemId);
    frenzyTotal += frenzyAdjustmentFor(gemId);
  }

  // blast-chained cells aren't a formed match — one flat gem value each
  for (const cell of incidentalCells) {
    rawScore += getGemBaseValue(gemIdForType(cell.gemType));
  }

  const comboScaled = rawScore * getComboMultiplier(comboCount);
  const afterFlatBonuses = comboScaled + affinityTotal + frenzyTotal;

  // global step: multiplier first, then the flat add — see handoff
  const finalScore = afterFlatBonuses * boonEffectState.globalScoreMultiplier + boonEffectState.globalScoreBonus;

  return Math.round(finalScore); // negative allowed
}