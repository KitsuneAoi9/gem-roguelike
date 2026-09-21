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
 * Total flat per-match adjustment a gem's OWN matches currently
 * carry: its Affinity bonus (if any) plus every active Frenzy pick's
 * contribution — that pick's bonus if `gemId` IS the Frenzy's target
 * gem, or its penalty if `gemId` is any other gem.
 *
 * Exported so the side stats panel (main.js's renderSideStats()) can
 * show the EXACT same number the scoring pipeline actually applies,
 * instead of re-deriving (and risking drifting out of sync with)
 * this math a second time. This was the root cause of Frenzy not
 * showing up in the side panel before — it only ever read
 * boonEffectState.affinityBonus directly, which Frenzy never writes
 * to (Frenzy lives in boonEffectState.frenzyPicks instead).
 *
 * @param {string} gemId
 * @returns {number}
 */
export function getMatchBonusForGem(gemId) {
  return affinityBonusFor(gemId) + frenzyAdjustmentFor(gemId);
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

  // Blast-chained cells aren't a formed match — one flat gem value
  // each, same as before. NEW: they now also pull their own
  // Affinity/Frenzy contribution, same as a formed match would — an
  // exploded gem is still THAT gem being cleared off the board, so
  // it shouldn't lose out on boons scoped to it just because a
  // laser/discharger did the clearing instead of a direct match.
  for (const cell of incidentalCells) {
    const gemId = gemIdForType(cell.gemType);
    rawScore += getGemBaseValue(gemId);
    affinityTotal += affinityBonusFor(gemId);
    frenzyTotal += frenzyAdjustmentFor(gemId);
  }

  const comboScaled = rawScore * getComboMultiplier(comboCount);
  const afterFlatBonuses = comboScaled + affinityTotal + frenzyTotal;

  // global step: multiplier first, then the flat add — see handoff
  const finalScore = afterFlatBonuses * boonEffectState.globalScoreMultiplier + boonEffectState.globalScoreBonus;

  return Math.round(finalScore); // negative allowed
}