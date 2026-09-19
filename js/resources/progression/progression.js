// ============================================================
// PROGRESSION.JS (resources) — mutable, per-level FIELD VARIABLES.
//
// Same role as constants.js, but for values that change during
// play instead of staying fixed: current level, score target,
// moves allowed, board size. No functions here — the logic that
// computes and updates these values lives in
// js/gameplay/progression.js.
//
// Values below are just initial placeholders; resetProgression()
// (gameplay/progression.js) overwrites them as soon as a run starts.
// ============================================================

import { DEFAULT_MOVES, BOARD_SIZE } from '../constant/constants.js';

export const progressionState = {
  level: 1,
  scoreTarget: 0,
  movesAllowed: DEFAULT_MOVES,
  boardSize: BOARD_SIZE,
};