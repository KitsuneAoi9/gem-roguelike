// ============================================================
// GEM_BASE_STATE.JS — mutable, per-run FIELD VARIABLE.
//
// Per-gem-id deltas on top of DEFAULT_GEM_BASE_SCORE/MULTIPLIER
// (base_score.js). Bounty/Brilliance/Carat/Lust boons mutate
// scoreBonus; Enthusiast/Addict/Fanatic/Maniac mutate multiplierBonus.
// Keyed by gem id string, not board index, so locked/future gems
// (Onyx etc.) can accumulate Lust/Maniac penalties before they're
// ever unlocked. No functions here — see js/gameplay/gem_base.js.
// ============================================================

export const gemBaseState = {
  perGem: {}, // gemId -> { scoreBonus: number, multiplierBonus: number }
};