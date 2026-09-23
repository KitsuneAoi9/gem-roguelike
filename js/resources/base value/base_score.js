// ============================================================
// BASE_SCORE.JS — base score + multiplier defaults, match-size
// multiplier table, and cascade multiplier curve.
//
// DEFAULT_GEM_BASE_SCORE/MULTIPLIER are just the starting point —
// each gem's ACTUAL base score/multiplier is this default plus its
// deltas in gem_base_state.js (mutated by Bounty/Brilliance/Carat/
// Opulence/Enthusiast/Addict/Fanatic/Maniac boons). See gameplay/gem_base.js.
//
// Mirrors the scoring design table:
//   Gem              base score 10,  multiplier 1.0x
//   Match-3          base score 30,  multiplier 1.0x
//   Match-4 (Flame)  base score 60,  multiplier 1.5x
//   Match-5 (Hyper)  base score 125, multiplier 2.5x  (also used for 6+)
//   Cascade Lvl 1    multiplier 1.0x
//   Cascade Lvl 2    multiplier 1.5x
//   Cascade Lvl 3+   multiplier 2.0x  (1.0 + (comboCount-1)*0.5)
// ============================================================

export const DEFAULT_GEM_BASE_SCORE = 10;
export const DEFAULT_GEM_BASE_MULTIPLIER = 1.0;

// Keyed by match length (3/4/5). Anything 5+ reuses the 5 entry —
// score.js clamps to this table's max key.
export const MATCH_BASE_MULTIPLIER = {
  3: 1.0,
  4: 1.5, // spawns a Flame gem
  5: 2.5, // spawns a Hypercube — also used for 6+
};

// Reference-only "Base Score" column, assuming default gem value (10)
// with no boons applied. score.js computes the real value from each
// gem's actual (boon-adjusted) base value, not this table.
export const MATCH_BASE_SCORE = {
  3: 30,
  4: 60,
  5: 125,
};

// --- cascade combo multiplier curve ---
export const CASCADE_BASE_MULTIPLIER = 1.0;
export const CASCADE_COMBO_STEP = 0.5;