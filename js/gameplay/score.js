// ============================================================
// SCORE.JS — turns cleared cells into a final score for one cascade
// step, following the scoring design table + boon effects.
//
// Pipeline per cascade step:
//   1. Each matched group: gemBaseValue x length x sizeMultiplier
//   2. Each incidental (blast-chained) cell: one flat gemBaseValue
//   3. Sum scaled by the cascade combo multiplier
//   4. Affinity + Frenzy added flat
//   5. Global bonus added, THEN the global multiplier is applied
//      (CHANGED THIS ROUND — see calculateCascadeStepScore()'s doc
//      comment below for the exact before/after).
//
// Negative results are allowed — see handoff Gotchas.
// ============================================================

import { MATCH_BASE_MULTIPLIER, CASCADE_BASE_MULTIPLIER, CASCADE_COMBO_STEP } from '../resources/base%20value/base_score.js';
import { GEM_DEFINITIONS } from '../resources/constant/constants.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import { getGemBaseValue } from './gem_base.js';

/**
 * 5+ all reuse the 5-tier value — no separate tier past 5.
 *
 * CHANGED THIS ROUND — on top of the fixed base_score.js table, this
 * now also adds whatever Threesome/Foursome/Fivesome Matchmaker bonus
 * is currently active for that same tier (boonEffectState.matchSizeBonus),
 * stacking up to 3 picks per size. Table value stays the game's
 * unmodified baseline; the boon bonus is purely additive on top.
 */
function getMatchSizeMultiplier(length) {
  const tier = length >= 5 ? 5 : length;
  const base = MATCH_BASE_MULTIPLIER[tier] ?? MATCH_BASE_MULTIPLIER[3];
  const matchmakerBonus = boonEffectState.matchSizeBonus[tier] || 0; // NEW
  return base + matchmakerBonus;
}

/** Numeric board gemType -> gem id string. Exported so gameplay/event.js's Elite gem-tracking, and gameplay/curse.js's Decaying Birthstone tracking, can reuse it. */
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
 * for `gemId`. Each pick only ever affects its own target gem
 * (bonus) plus exactly the specific random gems chosen for it at pick
 * time (`pick.penalizedGems`).
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
  }
  return total;
}

/**
 * Total flat per-match adjustment a gem's OWN matches currently
 * carry: its Affinity bonus (if any) plus every active Frenzy pick's
 * contribution. Exported so the side stats panel can show the EXACT
 * same number the scoring pipeline actually applies.
 *
 * @param {string} gemId
 * @returns {number}
 */
export function getMatchBonusForGem(gemId) {
  return affinityBonusFor(gemId) + frenzyAdjustmentFor(gemId);
}

/**
 * Counts how many cells of a specific gemId were cleared in one
 * cascade step (matched groups' full length + one per incidental
 * cell). Used by the Elite gem_cap win-condition (Cultist's Ritual)
 * AND the Decaying Birthstone curse's lethal-clear tracking
 * (gameplay/curse.js) — both mean "any clear, matched or blast-
 * chained" by "cleared."
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
 * How much of one cascade step's score is attributable to one
 * specific gemId, used by the Elite gem_subscore_race win-condition
 * (Gem Cultivator). Deliberately EXCLUDES globalScoreBonus, since
 * that's a flat once-per-step add-on with no single gem to attribute
 * it to (this exclusion is why the recent bonus/multiplier reordering
 * in calculateCascadeStepScore() below needed NO change here at all —
 * bonus was never part of this function's math to begin with).
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
 * Scores one cascade step (one resolveMatches() pass, or a
 * swap-activated combo treated as one oversized group).
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
  // each, but they still pull their own Affinity/Frenzy contribution,
  // same as a formed match would.
  for (const cell of incidentalCells) {
    const gemId = gemIdForType(cell.gemType);
    rawScore += getGemBaseValue(gemId);
    affinityTotal += affinityBonusFor(gemId);
    frenzyTotal += frenzyAdjustmentFor(gemId);
  }

  const comboScaled = rawScore * getComboMultiplier(comboCount);
  const afterFlatBonuses = comboScaled + affinityTotal + frenzyTotal;

  // CHANGED THIS ROUND — the global step used to be "multiply, THEN
  // add the flat bonus":
  //   finalScore = afterFlatBonuses * globalScoreMultiplier + globalScoreBonus
  // It's now reordered to "add the flat bonus FIRST, then multiply
  // the whole thing":
  //   finalScore = (afterFlatBonuses + globalScoreBonus) * globalScoreMultiplier
  // Both steps are still the LAST two steps of the whole pipeline —
  // only their relative order flipped. This makes the global bonus
  // itself benefit from the global multiplier too, instead of being
  // tacked on afterward untouched.
  const finalScore = (afterFlatBonuses + boonEffectState.globalScoreBonus) * boonEffectState.globalScoreMultiplier;

  return Math.round(finalScore); // negative allowed
}