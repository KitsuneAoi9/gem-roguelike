// ============================================================
// BOON.JS (resources) — the full pool of boons that can be offered.
//
// REWORKED THIS ROUND per the new design sheet's two-section layout:
//   A. "Series" boons — one archetype x every gem in the 11-gem
//      catalog (now 11 archetypes, up from 10 — Polish is new).
//   B. "Non-series" boons — global, not gem-scoped at all (Jeweler/
//      Gemologist), same spirit as the 4 existing global-score boons
//      but touching every gem's base value instead of the running
//      score total.
//
// Built from GEM_ARCHETYPES x ALL_GEM_CATALOG (11 x 11 = 121 entries)
// plus 4 global-score boons plus 2 non-series boons, instead of
// hand-written literals, so the design sheet's numbers live in one
// place per archetype. `effect` is a structured payload —
// js/gameplay/boon_effects.js dispatches on `effect.kind`.
// ============================================================

import { ALL_GEM_CATALOG } from '../constant/constants.js';

export const BOON_TYPE = {
  BUFF: 'buff',
  RISKY_BUFF: 'risky_buff', // renamed from BUFF_WITH_DRAWBACK
  TILE_BASIC: 'tile_basic',
  TILE_EXPANDED: 'tile_expanded',
  CURSE: 'curse',
};

export const BOON_RARITY = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary',
};

// Base appearance odds when an offer is rolled. Not yet adjusted by
// a Luck stat — generateBoonOffer() (js/gameplay/boon.js) reads this
// as-is; a Luck stat would shift these weights, not replace them.
export const BOON_RARITY_WEIGHTS = {
  [BOON_RARITY.COMMON]: 0.50,
  [BOON_RARITY.UNCOMMON]: 0.25,
  [BOON_RARITY.RARE]: 0.15,
  [BOON_RARITY.EPIC]: 0.08,
  [BOON_RARITY.LEGENDARY]: 0.02,
};

/**
 * One entry per per-gem archetype ("Series" boons — section A of the
 * design sheet). `description` is filled in per gem below — takes
 * (capitalizedGemName, lowercaseGemName) since the sheet's wording
 * mixes both cases mid-sentence.
 *
 * REWORKED THIS ROUND — numbers, rarities, and max-occurrence caps
 * all changed per the new sheet; Polish is a brand new archetype
 * (11th, so 11 gems x 11 archetypes now). Three archetypes (Frenzy,
 * Brilliance, Addict) changed from "penalize EVERY other gem" to
 * "penalize exactly TWO random other gems" — that randomness can't
 * be resolved here (this file is data-only, Rule 6), so these three
 * just carry a `penalizedCount` field alongside the flat
 * `othersPenalty`/`penalty` amount. The ACTUAL random gem selection
 * happens once, at pick time, in js/gameplay/boon_effects.js's
 * applyBoonEffect() — see its pickRandomOtherGems() helper.
 */
const GEM_ARCHETYPES = [
  {
    idSuffix: 'affinity',
    nameSuffix: 'Affinity',
    description: (Gem) => `Matching ${Gem} grants +100 bonus score.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: 1,
    effect: { kind: 'affinity', amount: 100 },
  },
  {
    idSuffix: 'frenzy',
    nameSuffix: 'Frenzy',
    description: (Gem) => `${Gem} matches gain +200 bonus score, but two other random gems' matches lose -50 bonus score.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 1,
    // penalizedCount: how many OTHER gems get the per-match penalty —
    // picked randomly, once, when this boon is applied (NOT every
    // other gem, unlike the old version of Frenzy).
    effect: { kind: 'frenzy', bonus: 200, penalty: -50, penalizedCount: 2 },
  },
  {
    idSuffix: 'polish',
    nameSuffix: 'Polish',
    // NEW archetype — the only one that touches BOTH base score and
    // base multiplier in a single pick, with no drawback at all.
    description: (Gem) => `Increase ${Gem}'s base score value by +5 and multiplier value by +0.1.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: null, // Unlimited — no cap at all, per the sheet
    effect: { kind: 'gem_polish', scoreAmount: 5, multiplierAmount: 0.1 },
  },
  {
    idSuffix: 'bounty',
    nameSuffix: 'Bounty',
    description: (Gem) => `Increase the base score value of ${Gem} by +20.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 2,
    effect: { kind: 'gem_score_delta', amount: 20 },
  },
  {
    idSuffix: 'brilliance',
    nameSuffix: 'Brilliance',
    description: (Gem) => `Increase the base score value of ${Gem} by +50, but decrease two other random gems' base score value by -10.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3,
    // NEW kind — distinct from Opulence's 'gem_score_opulence' below, since
    // Brilliance only ever touches TWO random other gems, not every
    // other gem in the catalog.
    effect: { kind: 'gem_score_brilliance', amount: 50, othersPenalty: -10, penalizedCount: 2 },
  },
  {
    idSuffix: 'opulence',
    nameSuffix: 'Opulence',
    description: (Gem) => `Increase the base score value of ${Gem} by +250, but decrease the base score value of non-${Gem} gems by -10.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 2,
    // Unchanged kind — Opulence is still the "penalize EVERY other gem"
    // archetype, explicitly called out as "non-[gem] gems" (not
    // "two random gems") on the new sheet.
    effect: { kind: 'gem_score_opulence', amount: 250, othersPenalty: -10 },
  },
  {
    idSuffix: 'grandeur',
    nameSuffix: 'Grandeur',
    description: (Gem) => `Increase the base score value of ${Gem} by +500.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.LEGENDARY,
    maxOccurrences: 1,
    effect: { kind: 'gem_score_delta', amount: 500 },
  },
  {
    idSuffix: 'enthusiast',
    nameSuffix: 'Enthusiast',
    description: (Gem) => `Increase the base multiplier value of ${Gem} by +0.5.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: 2,
    effect: { kind: 'gem_multiplier_delta', amount: 0.5 },
  },
  {
    idSuffix: 'addict',
    nameSuffix: 'Addict',
    description: (Gem) => `Increase the base multiplier value of ${Gem} by +2.0, but decrease two other random gems' base multiplier value by -0.5.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 2,
    // Same kind name as before, but the SEMANTICS changed — see
    // boon_effects.js's 'gem_multiplier_addict' case: it now picks
    // two random other gems instead of hitting every other gem.
    effect: { kind: 'gem_multiplier_addict', amount: 2.0, othersPenalty: -0.5, penalizedCount: 2 },
  },
  {
    idSuffix: 'maniac',
    nameSuffix: 'Maniac',
    description: (Gem) => `Increase the base multiplier value of ${Gem} by +2.5.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 2,
    effect: { kind: 'gem_multiplier_delta', amount: 2.5 },
  },
  {
    idSuffix: 'fanatic',
    nameSuffix: 'Fanatic',
    description: (Gem) => `Increase the base multiplier value of ${Gem} by +15.0.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.LEGENDARY,
    maxOccurrences: 1,
    effect: { kind: 'gem_multiplier_delta', amount: 15.0 },
  },
];

// 11 gems x 11 archetypes = 121 entries.
const perGemBoons = ALL_GEM_CATALOG.flatMap(({ id: gemId, name: gemName }) => {
  const lower = gemName.toLowerCase();
  return GEM_ARCHETYPES.map(archetype => ({
    id: `${gemId}_${archetype.idSuffix}`,
    name: `${gemName} ${archetype.nameSuffix}`,
    description: archetype.description(gemName, lower),
    type: archetype.type,
    rarity: archetype.rarity,
    maxOccurrences: archetype.maxOccurrences,
    // effect.gem is also what gates this boon in gemUnlockState —
    // no separate "locked" flag needed on the boon itself.
    effect: { ...archetype.effect, gem: gemId },
  }));
});

// The 4 global-score boons — not gem-scoped, always in the pool.
// UNCHANGED this round — the redesign only touched the per-gem
// archetypes (section A) and added the two non-series boons (section
// B) below; these 4 still work exactly as before.
const globalBoons = [
  {
    id: 'gemstone_gamble',
    name: 'Gemstone Gamble',
    description: 'Matching gems grants +50 global score bonus, but increases the target score by +5%.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 10,
    effect: { kind: 'global_score_boost', flatBonusDelta: 50, targetPercentIncrease: 0.05 },
  },
  {
    id: 'trinket_wager',
    name: 'Trinket Wager',
    description: 'Matching gems grants +150 global score bonus, but increases the target score by +15%.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 10,
    effect: { kind: 'global_score_boost', flatBonusDelta: 150, targetPercentIncrease: 0.15 },
  },
  {
    id: 'gem_greed',
    name: 'Gem Greed',
    description: 'Increase the global score multiplier by +1, but increase the target score by +50%.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 10,
    effect: { kind: 'global_score_boost', flatMultiplierDelta: 1, targetPercentIncrease: 0.50 },
  },
  {
    id: 'jewel_avarice',
    name: 'Jewel Avarice',
    description: 'Increase the global score multiplier by +4, but increase the target score by +150%.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 10,
    effect: { kind: 'global_score_boost', flatMultiplierDelta: 4, targetPercentIncrease: 1.50 },
  },
];

// NEW — "Non-series" boons (section B of the design sheet): global,
// but unlike the 4 above, these touch every gem's BASE VALUE (score
// or multiplier) rather than the running score total/target. No
// `effect.gem` field at all, so — same as globalBoons — they're
// never gated by gemUnlockState (see boon.js gameplay's
// isBoonAvailable()); their own dispatcher case in boon_effects.js
// applies the delta to every id in ALL_GEM_IDS directly, locked gems
// included, same precedent Opulence already set for "hits every gem"
// effects.
const nonSeriesBoons = [
  {
    id: 'jeweler',
    name: 'Jeweler',
    description: 'Increase all gem base score value by +25.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 2,
    effect: { kind: 'all_gem_score_delta', amount: 25 },
  },
  {
    id: 'gemologist',
    name: 'Gemologist',
    description: 'Increase all gem base multiplier value by +1.5.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.LEGENDARY,
    maxOccurrences: 2,
    effect: { kind: 'all_gem_multiplier_delta', amount: 1.5 },
  },
];

// The Construction/Deconstruction boons — still removed from the
// pool "for the time being" (see handoff Part 4 §22). Left fully
// intact and commented out, same as before — restoring the feature
// later is just uncommenting the spread below.
const constructionDeconstructionBoons = [
  {
    id: 'quarry_extension',
    name: 'Quarry Extension',
    description: 'Grow your board with a 3×1 strip.',
    type: BOON_TYPE.TILE_BASIC,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 3,
    effect: { kind: 'board_expand', shape: 'THREE_BY_ONE' },
  },
  {
    id: 'open_pit_expansion',
    name: 'Open-Pit Expansion',
    description: 'Grow your board with a 3×3 block.',
    type: BOON_TYPE.TILE_EXPANDED,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3,
    effect: { kind: 'board_expand', shape: 'THREE_BY_THREE' },
  },
  {
    id: 'condemned_shaft',
    name: 'Condemned Shaft',
    description: 'Remove a 1×1 cell from your board.',
    type: BOON_TYPE.CURSE,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: 3,
    effect: { kind: 'board_shrink', shape: 'ONE_BY_ONE' },
  },
  {
    id: 'collapsing_vein',
    name: 'Collapsing Vein',
    description: 'Grow your board with a 5×1 strip, but a 3×1 strip elsewhere collapses.',
    type: BOON_TYPE.CURSE,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3,
    effect: { kind: 'board_expand_and_shrink', expandShape: 'FIVE_BY_ONE', shrinkShape: 'THREE_BY_ONE' },
  },
];

//export const BOON_POOL = [...perGemBoons, ...globalBoons, ...constructionDeconstructionBoons, ...nonSeriesBoons];
export const BOON_POOL = [...perGemBoons, ...globalBoons, ...nonSeriesBoons];