// ============================================================
// BOON_EFFECT_STATE.JS — mutable, per-run FIELD VARIABLE.
//
// Everything a picked boon can affect that ISN'T a per-gem base
// value (that's gem_base_state.js): flat per-match Affinity bonuses,
// Frenzy bonus/penalty pairs, the global score multiplier/bonus +
// target score multiplier, Entropy/Luminous/Explosive Shard's pick
// counts, and Threesome/Foursome/Fivesome Matchmaker's per-match-size
// multiplier bonus. Reset every "start over" — see
// js/gameplay/boon_effects.js's resetBoonEffects().
// ============================================================

export const boonEffectState = {
  affinityBonus: {},          // gemId -> cumulative flat per-match bonus
  frenzyPicks: [],            // { gemId, bonus, penalty }[] — one per Frenzy pick
  globalScoreMultiplier: 1.0, // stacks additively (Gem Greed / Jewel Avarice / Warmonger / Adventure Junkie)
  globalScoreBonus: 0,        // stacks additively (Gemstone Gamble / Trinket Wager / Warmonger)
  targetScoreMultiplier: 1.0, // stacks multiplicatively (all global-score-boost boons' %)

  // NEW — Entropy/Luminous/Explosive Shard pick counts (0-2 each, per
  // their own maxOccurrences). Read by gameplay/special_gem.js's
  // match-3 bonus-spawn/Obsidian rolls — each extra copy of the SAME
  // shard boon adds another +10% to that boon's own chance.
  shardPicks: { entropy: 0, luminous: 0, explosive: 0 },

  // NEW — Threesome/Foursome/Fivesome Matchmaker's additive bonus on
  // top of base_score.js's fixed MATCH_BASE_MULTIPLIER table, keyed
  // the same way (match length 3/4/5). Read by gameplay/score.js's
  // getMatchSizeMultiplier(). Each boon can stack up to 3 copies.
  matchSizeBonus: { 3: 0, 4: 0, 5: 0 },
};