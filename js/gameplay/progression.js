// ============================================================
// PROGRESSION.JS (gameplay) — logic for per-level settings.
//
// Reads/writes progressionState (resources/progression/progression.js)
// but owns none of the state itself — same split as board.js (logic)
// vs. a grid array (data), just for level progression instead of the
// board. Formulas below are placeholders, same spirit as score.js.
// ============================================================

import { DEFAULT_MOVES, BOARD_SIZE } from '../resources/constant/constants.js';
import { progressionState } from '../resources/progression/progression.js';

/**
 * Score needed to clear a given level.
 * Placeholder curve: ~25% growth per level, rounded to the nearest
 * 50 so the number reads as intentional rather than a raw decimal.
 *
 * @param {number} level - 1-based level number.
 * @returns {number} score target for that level.
 */
export function calculateScoreTarget(level) {
  const raw = 500 * Math.pow(1.25, level - 1);
  return Math.round(raw / 50) * 50;
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
 * BOARD_SIZE directly.
 *
 * @param {number} level - 1-based level number.
 * @returns {number} board size (width == height) for that level.
 */
export function calculateBoardSize(level) {
  return BOARD_SIZE;
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