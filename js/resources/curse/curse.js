// ============================================================
// CURSE.JS (resources) — the fixed curse catalog. Same role as
// boon.js/event.js: fixed, game-wide data only.
//
// Only ONE entry exists so far — "Weight of Greed", granted by the
// Lost Miner Encounter's "Absorb" choice. Its `effect` is shaped
// EXACTLY like a boon's `global_score_boost` kind on purpose:
// gameplay/boon_effects.js's applyBoonEffect()/reverseBoonEffect()
// already handle that kind's targetPercentIncrease math (and its
// exact reversal) fully generically off `def.effect`, so a curse can
// reuse that dispatcher completely as-is — no new effect kind, no new
// apply/reverse code, needed for this first curse.
// ============================================================

export const CURSE_POOL = [
  {
    id: 'weight_of_greed',
    name: 'Weight of Greed',
    description: 'Increases the score target of every future level by +10%, starting next level.',
    // Reuses the 'global_score_boost' kind — see file header. No
    // flatMultiplierDelta/flatBonusDelta at all (a pure target-score
    // curse, no effect on the running score itself).
    effect: { kind: 'global_score_boost', targetPercentIncrease: 0.10 },
  },
];