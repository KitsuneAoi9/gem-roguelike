// ============================================================
// BOON_EFFECT_STATE.JS — mutable, per-run FIELD VARIABLE.
//
// Everything a picked boon can affect that ISN'T a per-gem base
// value (that's gem_base_state.js): flat per-match Affinity bonuses,
// Frenzy bonus/penalty pairs, and the global score multiplier/bonus
// + target score multiplier. Reset every "start over" — see
// js/gameplay/boon_effects.js's resetBoonEffects().
// ============================================================

export const boonEffectState = {
  affinityBonus: {},          // gemId -> cumulative flat per-match bonus
  frenzyPicks: [],            // { gemId, bonus, penalty }[] — one per Frenzy pick
  globalScoreMultiplier: 1.0, // stacks additively (Gem Greed / Jewel Avarice)
  globalScoreBonus: 0,        // stacks additively (Gemstone Gamble / Trinket Wager)
  targetScoreMultiplier: 1.0, // stacks multiplicatively (all 4 global boons' %)
};