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

/** Numeric board gemType -> gem id string. NEW — exported this round so gameplay/event.js's Elite gem-tracking can reuse it. */
export function gemIdForType(gemType) {
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

/**
 * Total flat per-match penalty/bonus a Frenzy-type pick contributes
 * for `gemId`. CHANGED THIS ROUND — a Frenzy pick used to penalize
 * EVERY gem other than its target; now each pick only ever affects
 * its own target gem (bonus) plus exactly the two specific random
 * gems chosen for it at pick time (`pick.penalizedGems`, set once in
 * boon_effects.js's applyBoonEffect() and never re-rolled). Any gem
 * that's neither the target nor in that pick's penalizedGems list is
 * completely unaffected by that particular Frenzy pick.
 *
 * @param {string} gemId
 * @returns {number}
 */
function frenzyAdjustmentFor(gemId) {
  let total = 0;
  for (const pick of boonEffectState.frenzyPicks) {
    if (pick.gemId === gemId) {
      total += pick.bonus;
    } else if (pick.penalizedGems && pick.penalizedGems.includes(gemId)) {
      total += pick.penalty;
    }
    // else: this specific Frenzy pick doesn't touch gemId at all.
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
 * NEW — counts how many cells of a specific gemId were cleared in one
 * cascade step (matched groups' full length + one per incidental
 * cell). Used by the Elite gem_cap win-condition (Cultist's Ritual) —
 * "destroy" there means ANY clear, matched or blast-chained, per
 * design.
 *
 * @param {string} gemId
 * @param {{gemType:number,length:number}[]} matchedGroups
 * @param {{gemType:number,row:number,col:number}[]} incidentalCells
 * @returns {number}
 */
export function countGemClears(gemId, matchedGroups, incidentalCells) {
  let count = 0;
  for (const group of matchedGroups) {
    if (gemIdForType(group.gemType) === gemId) count += group.length;
  }
  for (const cell of incidentalCells) {
    if (gemIdForType(cell.gemType) === gemId) count += 1;
  }
  return count;
}

/**
 * NEW — how much of one cascade step's score is attributable to one
 * specific gemId, used by the Elite gem_subscore_race win-condition
 * (Gem Cultivator). Filters matchedGroups/incidentalCells down to
 * just that gem, then runs the SAME formula calculateCascadeStepScore()
 * uses (base value x length x size multiplier, + Affinity/Frenzy,
 * scaled by the step's combo multiplier and global multiplier) — but
 * deliberately EXCLUDES globalScoreBonus, since that's a flat
 * once-per-step add-on with no single gem to attribute it to.
 *
 * This is a reasonable approximation, not a re-derivation of exactly
 * what calculateCascadeStepScore() returned for the WHOLE step (a
 * step with multiple gem types splits its combo/global multiplier
 * proportionally by construction, so summing every gem's attributed
 * score back up won't exactly equal the step's real total once the
 * flat bonus is involved) — acceptable here since this only ever
 * feeds a progress threshold, not the player's actual score.
 *
 * @param {string} gemId
 * @param {{gemType:number,length:number}[]} matchedGroups
 * @param {{gemType:number,row:number,col:number}[]} incidentalCells
 * @param {number} comboCount
 * @returns {number}
 */
export function calculateGemAttributedScore(gemId, matchedGroups, incidentalCells, comboCount) {
  let rawScore = 0;
  let affinityTotal = 0;
  let frenzyTotal = 0;

  for (const group of matchedGroups) {
    if (gemIdForType(group.gemType) !== gemId) continue;
    rawScore += getGemBaseValue(gemId) * group.length * getMatchSizeMultiplier(group.length);
    affinityTotal += affinityBonusFor(gemId);
    frenzyTotal += frenzyAdjustmentFor(gemId);
  }
  for (const cell of incidentalCells) {
    if (gemIdForType(cell.gemType) !== gemId) continue;
    rawScore += getGemBaseValue(gemId);
    affinityTotal += affinityBonusFor(gemId);
    frenzyTotal += frenzyAdjustmentFor(gemId);
  }

  if (rawScore === 0 && affinityTotal === 0 && frenzyTotal === 0) return 0;

  const comboScaled = rawScore * getComboMultiplier(comboCount);
  const afterFlatBonuses = comboScaled + affinityTotal + frenzyTotal;
  const attributed = afterFlatBonuses * boonEffectState.globalScoreMultiplier;
  return Math.round(attributed);
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