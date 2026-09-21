// ============================================================
// BOON.JS (resources) — the full pool of boons that can be offered.
//
// Built from GEM_ARCHETYPES x ALL_GEM_CATALOG (110 entries) plus 4
// global-score boons, instead of 114 hand-written literals, so the
// design sheet's numbers live in one place per archetype. `effect`
// is a structured payload — js/gameplay/boon_effects.js dispatches
// on `effect.kind`.
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
  LEGENDARY: 'legendary', // not used by any boon yet — reserved for a future Luck stat
};

// Base appearance odds when an offer is rolled. Not yet adjusted by
// a Luck stat — generateBoonOffer() (js/gameplay/boon.js) reads this
// as-is; a Luck stat would shift these weights, not replace them.
export const BOON_RARITY_WEIGHTS = {
  [BOON_RARITY.COMMON]: 0.50,
  [BOON_RARITY.UNCOMMON]: 0.20,
  [BOON_RARITY.RARE]: 0.18,
  [BOON_RARITY.EPIC]: 0.10,
  [BOON_RARITY.LEGENDARY]: 0.02,
};

/**
 * One entry per per-gem archetype. `description` is filled in per
 * gem below — takes (capitalizedGemName, lowercaseGemName) since the
 * sheet's wording mixes both cases mid-sentence.
 */
const GEM_ARCHETYPES = [
  {
    idSuffix: 'affinity',
    nameSuffix: 'Affinity',
    description: (Gem) => `Matching ${Gem} grants +50 bonus score.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: 5,
    effect: { kind: 'affinity', amount: 50 },
  },
  {
    idSuffix: 'frenzy',
    nameSuffix: 'Frenzy',
    description: (Gem, gem) => `${Gem} matches gain +100 bonus score, but non-${gem} matches lose -5 bonus score.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3, // Unlimited
    effect: { kind: 'frenzy', bonus: 100, penalty: -10 },
  },
  {
    idSuffix: 'bounty',
    nameSuffix: 'Bounty',
    description: (Gem) => `Increase the base score value of ${Gem} by +25.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: 5,
    effect: { kind: 'gem_score_delta', amount: 25 },
  },
  {
    idSuffix: 'brilliance',
    nameSuffix: 'Brilliance',
    description: (Gem) => `Increase the base score value of ${Gem} by +75, but decrease the base score value of non-${Gem} gems by -5.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3,
    effect: { kind: 'gem_score_lush', amount: 75, othersPenalty: -5 },
  },
  {
    idSuffix: 'lush',
    nameSuffix: 'Lush',
    description: (Gem) => `Increase the base score value of ${Gem} by +225, but decrease the base score value of non-${Gem} gems by -10.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 5,
    effect: { kind: 'gem_score_lush', amount: 225, othersPenalty: -10 },
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
    maxOccurrences: 5,
    effect: { kind: 'gem_multiplier_delta', amount: 0.5 },
  },
  {
    idSuffix: 'addict',
    nameSuffix: 'Addict',
    description: (Gem) => `Increase the base multiplier value of ${Gem} by +2.0, but decrease the base multiplier value of non-${Gem} gems by -0.5.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3,
    effect: { kind: 'gem_multiplier_delta', amount:  2.0, othersPenalty: -0.5 },
  },
  {
    idSuffix: 'maniac',
    nameSuffix: 'Maniac',
    description: (Gem) => `Increase the base multiplier value of ${Gem} by +3.0.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 1,
    effect: { kind: 'gem_multiplier_maniac', amount: 5 },
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

// 11 gems x 10 archetypes = 110 entries.
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

// The Construction/Deconstruction boons. 
const constructionDeconstructionBoons = [
  // --- board shape boons (expand-board / shrink-board / risky combined) ---
  {
    id: 'quarry_extension',
    name: 'Quarry Extension',
    description: 'Grow your board with a 3×1 strip.',
    type: BOON_TYPE.TILE_BASIC,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 3, // the board can always use more room, within the 20x20 ceiling
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
    type: BOON_TYPE.CURSE, // RISKY_BUFF-flavored, matching Frenzy/global boons' spirit
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3,
    effect: { kind: 'board_expand_and_shrink', expandShape: 'FIVE_BY_ONE', shrinkShape: 'THREE_BY_ONE' },
  },
]

export const BOON_POOL = [...perGemBoons, ...globalBoons, ...constructionDeconstructionBoons];