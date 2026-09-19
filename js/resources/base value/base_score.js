// ============================================================
// BASE_SCORE.JS — base score + multiplier values for gem matches
// and cascades.
//
// Fixed, game-wide data — same role as constants.js, just scoped to
// the scoring design doc (gem base value, match-size multipliers,
// cascade multiplier). No functions here; js/gameplay/score.js reads
// these to compute actual points.
//
// Mirrors the scoring design table:
//   Gem              base score 10,  multiplier 1.0x
//   Match-3          base score 30,  multiplier 1.0x
//   Match-4 (Flame)  base score 40,  multiplier 1.5x
//   Match-5 (Hyper)  base score 50,  multiplier 2.5x
//   Cascade Lvl 1    multiplier 1.0x
//   Cascade Lvl 2    multiplier 1.5x
//   Cascade Lvl 3+   multiplier 2.0x  (1.0 + (comboCount-1)*0.5)
// ============================================================

// --- single gem base value ---
export const BASE_GEM_SCORE = 10;       // "Base Score" for one gem
export const BASE_GEM_MULTIPLIER = 1.0; // "Base Multiplier" for one gem

// --- match-size multiplier, keyed by match length (3/4/5) ---
// A match longer than 5 reuses the 5 entry — clamp to this table's
// max key wherever this is read.
export const MATCH_BASE_MULTIPLIER = {
  3: 1.0,
  4: 1.5, // spawns a Flame gem (line special)
  5: 2.5, // spawns a Hypercube (bomb/color gem)
};

// Reference "Base Score" column from the design table. Not yet
// consumed by score.js's formula — see TODO below.
export const MATCH_BASE_SCORE = {
  3: 30,
  4: 40,
  5: 50,
};

// --- cascade combo multiplier curve ---
export const CASCADE_BASE_MULTIPLIER = 1.0;
export const CASCADE_COMBO_STEP = 0.5;

// TODO: MATCH_BASE_MULTIPLIER / MATCH_BASE_SCORE aren't wired into
// calculateMatchScore() yet — that formula still scores off total
// cleared-cell count. Wiring this in needs the match's original
// length (3/4/5) passed down separately, since clearedCells also
// includes chain-reaction cells from specials.