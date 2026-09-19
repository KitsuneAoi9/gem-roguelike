// ============================================================
// SCORE.JS — combo tracking and score formula.
//
// Deliberately separate from board.js: board.js only knows what
// moves are legal, it has no concept of "points." Keeping scoring
// here means the combo formula can change freely without touching
// grid logic at all.
// ============================================================

export const BASE_MULTIPLIER = 1;
export const COMBO_STEP = 0.5; // temporary formula — tune once playtested

/**
 * Score multiplier for a given combo step.
 * comboCount 1 -> 1x, 2 -> 1.5x, 3 -> 2x, 4 -> 2.5x, etc.
 * Placeholder curve: linear growth, no cap. Easy to swap for
 * something steeper (or with a cap) later without touching callers.
 *
 * @param {number} comboCount - how many cascade steps deep within one swap (1 = first match).
 * @returns {number} the multiplier to apply to that step's raw score.
 */
export function getComboMultiplier(comboCount) {
  return BASE_MULTIPLIER + (comboCount - 1) * COMBO_STEP;
}

/**
 * Points awarded for clearing `gemCount` gems at combo step `comboCount`.
 * Rounded because fractional points look odd in a plain number display.
 *
 * @param {number} gemCount - number of gems cleared in this match.
 * @param {number} comboCount - which cascade step this is (see getComboMultiplier).
 * @param {number} pointsPerGem - base points per gem, before the combo multiplier.
 * @returns {number} whole-number points to add to the score.
 */
export function calculateMatchScore(gemCount, comboCount, pointsPerGem) {
  return Math.round(gemCount * pointsPerGem * getComboMultiplier(comboCount));
}
