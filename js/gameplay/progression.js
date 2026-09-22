// ============================================================
// PROGRESSION.JS (gameplay) — logic for per-level settings.
//
// Reads/writes progressionState (resources/progression/progression.js)
// but owns none of the state itself — same split as board.js (logic)
// vs. a grid array (data), just for level progression instead of the
// board. Formulas below are placeholders, same spirit as score.js.
// ============================================================

import { DEFAULT_MOVES, INITIAL_BOARD_SIZE } from '../resources/constant/constants.js';
import { progressionState } from '../resources/progression/progression.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';

/**
 * Score needed to clear a given level.
 *
 * UPDATED THIS ROUND — milestone scaling added on top of the Part 4
 * formula. New formula:
 *
 *   base(level)      = ROUND(1000 x 1.15^(level-1)) x level + 500 x 1.05^level
 *   milestoneFactor   = 1.10 ^ FLOOR((level-1) / 5)
 *   target(level)     = base(level) x milestoneFactor
 *
 * `milestoneFactor` is a STEP function, not a smooth curve — it
 * stays flat at exactly 1.0 for levels 1-5 (FLOOR((level-1)/5) is 0
 * for all of them), then jumps to a flat 1.10 for levels 6-10
 * (FLOOR gives 1), then a flat 1.21 (1.10^2) for levels 11-15, and so
 * on. Deliberately FLOOR, not a fractional exponent — every level
 * WITHIN one 5-level band scores identically to every other level in
 * that same band; the whole +10% jump lands all at once on the
 * band's first level (6, 11, 16, ...), not smeared gradually across
 * the 5 levels leading up to it. This is what makes it read as an
 * actual "milestone" rather than a continuously-creeping curve.
 *
 * `base(level)` itself is unchanged from Part 4 — same two-term
 * shape, same rounding convention (only the first term is rounded
 * before its `x level` multiply; the combined total, INCLUDING the
 * new milestone factor, is rounded once at the very end, after
 * boonEffectState.targetScoreMultiplier is applied — same as every
 * prior version of this formula).
 *
 * Still a PURE function of `level` alone — resetProgression()/
 * advanceLevel() can jump to any level with no dependency on having
 * calculated any other level first.
 *
 * @param {number} level - 1-based level number.
 * @returns {number} score target for that level.
 */
export function calculateScoreTarget(level) {
  const scaledTerm = Math.round(1000 * Math.pow(1.15, level - 1)) * level;
  const flatGrowthTerm = 500 * Math.pow(1.05, level);
  const base = scaledTerm + flatGrowthTerm;

  // NEW — milestone scaling: a flat +10% step every 5 levels, applied
  // on top of the base curve above. FLOOR (not a fractional exponent)
  // is what keeps this a true step function — see doc comment.
  const milestoneBand = Math.floor((level - 1) / 5);
  const milestoneFactor = Math.pow(1.10, milestoneBand);

  const raw = base * milestoneFactor;
  return Math.round(raw * boonEffectState.targetScoreMultiplier);
}

/**
 * Moves allowed for a given level. Placeholder: always the game-wide
 * default, regardless of `level`. Already takes `level` as a
 * parameter so a real per-level formula (stamina, upgrades, etc.)
 * can replace the body later without touching call sites.
 *
 * @param {number} level - 1-based level number.
 * @returns {number} moves allowed for that level's round.
 */
export function calculateMovesAllowed(level) {
  return DEFAULT_MOVES;
}

/**
 * Board size for a given level. Placeholder: always the constant
 * board size. Not wired into board.js yet — that file still reads
 * INITIAL_BOARD_SIZE directly.
 *
 * @param {number} level - 1-based level number.
 * @returns {number} board size (width == height) for that level.
 */
export function calculateBoardSize(level) {
  return INITIAL_BOARD_SIZE;
}

/**
 * Resets progressionState to the start of a given level (default: 1),
 * recalculating every derived value. Call from main.js's init() so
 * "start over" always begins from a clean level 1.
 *
 * @param {number} [level=1] - level to reset to.
 * @returns {void}
 */
export function resetProgression(level = 1) {
  progressionState.level = level;
  progressionState.scoreTarget = calculateScoreTarget(level);
  progressionState.movesAllowed = calculateMovesAllowed(level);
  progressionState.boardSize = calculateBoardSize(level);
}

/**
 * Advances progressionState to the next level, recalculating every
 * derived value for that level. Does NOT touch moves left mid-round —
 * that's round state main.js owns, not part of progressionState —
 * so main.js applies the level-up move bonus itself.
 *
 * @returns {void}
 */
export function advanceLevel() {
  progressionState.level += 1;
  progressionState.scoreTarget = calculateScoreTarget(progressionState.level);
  progressionState.movesAllowed = calculateMovesAllowed(progressionState.level);
  progressionState.boardSize = calculateBoardSize(progressionState.level);
}