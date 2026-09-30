// ============================================================
// BOON.JS (resources) — the full pool of boons that can be offered.
//
// NEW THIS ROUND — SHOP_ONLY_BOON_IDS + shopOnlyBoons (Booner, VIP
// Membership Card). Same treatment EVENT_ONLY_BOON_IDS already gets:
// these still live in the exported BOON_POOL array (so pickBoon()/
// isBoonAvailable() work normally on them), but gameplay/boon.js's
// offer generators exclude them entirely. They're ONLY ever granted
// through the new "Limited Edition Boons Sale" Customer Service slot
// in the shop (gameplay/customer_service.js).
//
// Both are presence-only markers ('flag_no_op') — nothing for
// boon_effects.js's applyBoonEffect() to apply/reverse:
//   - Booner: checked via isBoonActive('booner') in main.js's
//     maybeGrantBoonerBonusOffer() (counts copies for its stacking
//     +25%/copy chance).
//   - VIP Membership Card: checked via isBoonActive('vip_membership_card')
//     at every shop price calculation in main.js (applyVipDiscount()).
// ============================================================

import { ALL_GEM_CATALOG } from '../constant/constants.js';

export const BOON_TYPE = {
  BUFF: 'buff',
  RISKY_BUFF: 'risky_buff',
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

// NEW — ids of every boon that must NEVER appear through the normal
// weighted-roll (generateBoonOffer()) or equal-weight shop
// (generateEqualWeightBoonOffer()) pools — they're only ever granted
// directly by a specific event/challenge. Kept as a Set (not baked
// into each entry as a flag) so gameplay/boon.js's offer generators
// and gameplay/event.js's reward-pool lookup share exactly one source
// of truth for "which ids are event-only."
export const EVENT_ONLY_BOON_IDS = new Set(['overcharge_essence']);

// NEW — shop-exclusive boons, only ever obtainable via the "Limited
// Edition Boons Sale" Customer Service slot.
export const SHOP_ONLY_BOON_IDS = new Set(['booner', 'vip_membership_card']);

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
    effect: { kind: 'frenzy', bonus: 200, penalty: -50, penalizedCount: 2 },
  },
  {
    idSuffix: 'polish',
    nameSuffix: 'Polish',
    description: (Gem) => `Increase ${Gem}'s base score value by +5 and multiplier value by +0.1.`,
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: null,
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
    effect: { kind: 'gem_score_brilliance', amount: 50, othersPenalty: -10, penalizedCount: 2 },
  },
  {
    idSuffix: 'opulence',
    nameSuffix: 'Opulence',
    description: (Gem) => `Increase the base score value of ${Gem} by +250, but decrease the base score value of non-${Gem} gems by -10.`,
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 2,
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

const perGemBoons = ALL_GEM_CATALOG.flatMap(({ id: gemId, name: gemName }) => {
  const lower = gemName.toLowerCase();
  return GEM_ARCHETYPES.map(archetype => ({
    id: `${gemId}_${archetype.idSuffix}`,
    name: `${gemName} ${archetype.nameSuffix}`,
    description: archetype.description(gemName, lower),
    type: archetype.type,
    rarity: archetype.rarity,
    maxOccurrences: archetype.maxOccurrences,
    effect: { ...archetype.effect, gem: gemId },
  }));
});

const forbiddenBoons = ALL_GEM_CATALOG.map(({ id: gemId, name: gemName }) => ({
  id: `forbidden_${gemId}`,
  name: `Forbidden ${gemName}`,
  description: `Increase ${gemName} base score value by +250 and multiplier value by +2.5, but decrease a random gem's base score value by -250, and multiplier value by -2.5.`,
  type: BOON_TYPE.RISKY_BUFF,
  rarity: BOON_RARITY.EPIC,
  maxOccurrences: 1,
  effect: {
    kind: 'gem_forbidden_swap',
    gem: gemId,
    scoreAmount: 250,
    multiplierAmount: 2.5,
    otherScorePenalty: -250,
    otherMultiplierPenalty: -2.5,
    penalizedCount: 1,
  },
}));

const matchmakerBoons = [
  {
    id: 'threesome_matchmaker',
    name: 'Threesome Matchmaker',
    description: 'Increase match-3 multiplier by +0.5.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 3,
    effect: { kind: 'match_size_multiplier_bonus', size: 3, amount: 0.5 },
  },
  {
    id: 'foursome_matchmaker',
    name: 'Foursome Matchmaker',
    description: 'Increase match-4 multiplier by +1.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 3,
    effect: { kind: 'match_size_multiplier_bonus', size: 4, amount: 1 },
  },
  {
    id: 'fivesome_matchmaker',
    name: 'Fivesome Matchmaker',
    description: 'Increase match-5 multiplier by +1.5.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 3,
    effect: { kind: 'match_size_multiplier_bonus', size: 5, amount: 1.5 },
  },
];

const shardBoons = [
  {
    id: 'entropy_shard',
    name: 'Entropy Shard',
    description: 'Matching three now has a 10% chance of creating a Hyperspace Star gem, but also a 10% chance of creating an Obsidian gem.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 2,
    effect: { kind: 'match3_shard_chance', shardType: 'entropy' },
  },
  {
    id: 'luminous_shard',
    name: 'Luminous Shard',
    description: 'Matching three now has a 10% chance of creating a Laser Beam gem, but also a 10% chance of creating an Obsidian gem.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 2,
    effect: { kind: 'match3_shard_chance', shardType: 'luminous' },
  },
  {
    id: 'explosive_shard',
    name: 'Explosive Shard',
    description: 'Matching three now has a 10% chance of creating a Discharger gem, but also a 10% chance of creating an Obsidian gem.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 2,
    effect: { kind: 'match3_shard_chance', shardType: 'explosive' },
  },
];

const franticStarBoon = {
  id: 'frantic_star',
  name: 'Frantic Star',
  description: 'Hyperstar now also targets a second random gem type whenever it activates, but there is a 5% chance of a Hyperstar on the board activating entirely on its own after any cascade settles (still targeting two random gem types).',
  type: BOON_TYPE.RISKY_BUFF,
  rarity: BOON_RARITY.EPIC,
  maxOccurrences: 2,
  effect: { kind: 'flag_no_op' },
};

const commitmentBoons = [
  {
    id: 'warmonger',
    name: 'Warmonger',
    description: 'Increase the global score bonus by +250, but you can no longer refuse an Elite fight.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 1,
    effect: { kind: 'global_score_boost', flatBonusDelta: 250 },
  },
  {
    id: 'adventure_junkie',
    name: 'Adventure Junkie',
    description: 'Increase the global score multiplier by +2.5, but you can no longer refuse a Challenge event.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 1,
    effect: { kind: 'global_score_boost', flatMultiplierDelta: 2.5 },
  },
];

const perpetualBoon = {
  id: 'perpetual_boon',
  name: 'Perpetual Boon',
  description: 'Gain +1% of your current score at the end of every level, before any shop visit. Only ever appears in an offer once every other available boon has already been offered.',
  type: BOON_TYPE.BUFF,
  rarity: BOON_RARITY.RARE,
  maxOccurrences: null,
  effect: { kind: 'perpetual_score_percent', percent: 0.01 },
};

const overchargeEssenceBoon = {
  id: 'overcharge_essence',
  name: 'Overcharge Essence',
  description: 'At the start of the level, turn two random non-special gems into a Laser Beam or Discharger.',
  type: BOON_TYPE.BUFF,
  rarity: BOON_RARITY.LEGENDARY,
  maxOccurrences: 2,
  effect: { kind: 'overcharge_essence' },
};

// NEW — Booner / VIP Membership Card (shop-only, see file header).
const shopOnlyBoons = [
  {
    id: 'booner',
    name: 'Booner',
    description: 'Adds a 4th option to the level-up reward, with a 25% chance per copy.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 3,
    effect: { kind: 'flag_no_op' },
  },
  {
    id: 'vip_membership_card',
    name: 'VIP Membership Card',
    description: 'Reduce every shop price by 10%.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.LEGENDARY,
    maxOccurrences: 1,
    effect: { kind: 'flag_no_op' },
  },
];

const globalBoons = [
  {
    id: 'gemstone_gamble',
    name: 'Gemstone Gamble',
    description: 'Matching gems grants +50 global bonus score.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 5,
    effect: { kind: 'global_score_boost', flatBonusDelta: 50 },
  },
  {
    id: 'trinket_wager',
    name: 'Trinket Wager',
    description: 'Matching gems grants +300 global bonus score, but increases the target score by +15%.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 5,
    effect: { kind: 'global_score_boost', flatBonusDelta: 300, targetPercentIncrease: 0.15 },
  },
  {
    id: 'gem_greed',
    name: 'Gem Greed',
    description: 'Increase the global score multiplier by +1, but increase the target score by +50%.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.EPIC,
    maxOccurrences: 2,
    effect: { kind: 'global_score_boost', flatMultiplierDelta: 1, targetPercentIncrease: 0.50 },
  },
  {
    id: 'jewel_avarice',
    name: 'Jewel Avarice',
    description: 'Increase the global score multiplier by +4, but increase the target score by +150%.',
    type: BOON_TYPE.RISKY_BUFF,
    rarity: BOON_RARITY.LEGENDARY,
    maxOccurrences: 2,
    effect: { kind: 'global_score_boost', flatMultiplierDelta: 4, targetPercentIncrease: 1.50 },
  },
];

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
export const BOON_POOL = [
  ...perGemBoons,
  ...globalBoons,
  ...nonSeriesBoons,
  ...forbiddenBoons,
  ...matchmakerBoons,
  ...shardBoons,
  franticStarBoon,
  ...commitmentBoons,
  perpetualBoon,
  overchargeEssenceBoon,
  ...shopOnlyBoons, // NEW
];