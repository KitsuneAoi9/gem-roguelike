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
 * UPDATED THIS ROUND — no longer cumulative (previous-target-based).
 * Now a direct, standalone formula per level:
 *
 *   target(level) = ROUND(2000 x 1.25^(level-1)) x level
 *                    + 500 x 1.5^level
 *
 * Only the FIRST term is rounded before the x level multiply — same
 * "round early" behavior as the last formula. The second term
 * (500 x 1.5^level) is NOT separately rounded; the whole expression
 * is rounded once at the very end (see the final Math.round() below),
 * per how the formula was given.
 *
 * Since this no longer depends on target(level-1), it's back to a
 * single direct calculation — no loop needed. Still a PURE function
 * of `level`, so resetProgression()/advanceLevel() can jump to any
 * level and get the right answer with no dependency on having
 * calculated any other level first.
 *
 * The global targetScoreMultiplier (Gemstone Gamble / Trinket Wager /
 * Gem Greed / Jewel Avarice) is still applied to the WHOLE result,
 * same as every prior version of this formula.
 *
 * @param {number} level - 1-based level number.
 * @returns {number} score target for that level.
 */
export function calculateScoreTarget(level) {
  if ( level <= 1) return 2000; // level 1 is always 2000, no multiplier applied yet

  const scaledTerm = Math.round(2000 * Math.pow(1.25, level - 1)) * level;
  const flatGrowthTerm = 500 * Math.pow(1.5, level);
  const raw = scaledTerm + flatGrowthTerm;
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