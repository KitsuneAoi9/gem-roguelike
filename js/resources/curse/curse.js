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
  // Granted by Gem Cultivator's Elite fight on a LOSS (see
  // gameplay/event.js's ELITE_POOL/applyEliteOutcomeEffect()).
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

  // ============================================================
  // NEW — Decaying Birthstone / Petrified. Neither is wired to any
  // in-game grant trigger YET — both are meant to be handed out by a
  // future event (per design), so nothing in the game currently calls
  // grantCurse() with either of these ids. The full supporting
  // mechanism (tracking, the lethal check, the multiplier lock) is
  // implemented and ready below/in gameplay/curse.js +
  // gameplay/gem_base.js — only the "how does the player actually get
  // this" hookup is still missing, same category of gap as the
  // long-dormant shop.js system elsewhere in this project.
  // ============================================================

  // Extra per-pick data this curse needs (`trackedGemId`, `clearCount`)
  // is NOT declared here — it's supplied by the caller at grant time
  // via gameplay/curse.js's grantCurse(curseId, data), the same way a
  // boon's own random-pick data (e.g. Frenzy's penalizedGems) is
  // resolved at PICK time, not baked into the pool entry itself.
  {
    id: 'decaying_birthstone',
    name: 'Decaying Birthstone',
    description:
      'After clearing 100 of a random gem, you die and the run ends. Stacks independently per copy — ' +
      'two copies tracking the same gem require 200 total clears between them; a different gem is tracked completely separately.',
    effect: { kind: 'lethal_gem_clear', threshold: 100 },
  },
  {
    id: 'petrified',
    name: 'Petrified',
    description:
      "Sets a random gem's multiplier value to 0. The gem's multiplier stays locked at 0, ignoring any " +
      'further multiplier-changing boons, for as long as this curse remains active.',
    effect: { kind: 'gem_multiplier_lock' },
  },
];