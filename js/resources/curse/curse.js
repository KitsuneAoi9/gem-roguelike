// ============================================================
// CURSE.JS (resources) — the fixed curse catalog. Same role as
// boon.js/event.js: fixed, game-wide data only.
// ============================================================

export const CURSE_POOL = [
  {
    id: 'weight_of_greed',
    name: 'Weight of Greed',
    description: 'Increases the score target of every future level by +10%, starting next level.',
    effect: { kind: 'global_score_boost', targetPercentIncrease: 0.10 },
  },
  // NEW — granted by Gem Cultivator's Elite fight on a LOSS (see
  // resources/event/event.js), replacing what used to be a direct,
  // one-time -50% score deduction.
  //
  // This is deliberately NOT shaped like a normal boon effect. It
  // doesn't touch gemBaseState/boonEffectState at all — it's a
  // RECURRING, TRIGGERED effect instead of a static delta, which is
  // why applyBoonEffect() (boon_effects.js) has no case for
  // 'parasite_score_drain' at all: its `default` branch
  // (`reversible: false`) is exactly correct here, since there's
  // nothing for that dispatcher to apply or later reverse. The
  // ACTUAL draining happens in main.js's applyScoreGain(), which
  // checks gameplay/curse.js's getActiveCurseDefsByKind() once per
  // level cleared, for as long as this curse stays active.
  {
    id: 'crystallized_parasite',
    name: 'Crystallized Parasite',
    description: 'A parasite saps 15% of your current score at the end of every level, before any shop visit.',
    effect: { kind: 'parasite_score_drain', percent: 0.15 },
  },
];