// ============================================================
// BOONDEFINITIONS.JS — the full pool of boons that can be offered.
//
// Same role as constants.js: fixed, game-wide data. Each entry is a
// *template* — js/gameplay/boon.js turns a chosen template into an
// ActiveBoon instance (see boonState.js) when the player picks it.
//
// `effect` is a free-form payload — boon.js never looks inside it.
// It's yours to read from wherever you apply the actual buff/debuff
// (score.js, main.js, board.js), so its shape can evolve freely
// without ever touching the selection logic.
// ============================================================

export const BOON_TYPE = {
  BUFF: 'buff',                             // (A) straight small stat buff
  BUFF_WITH_DRAWBACK: 'buff_with_drawback', // (B) powerful buff, has a cost
  TILE_BASIC: 'tile_basic',                 // (C) one predetermined-position tile
  TILE_EXPANDED: 'tile_expanded',           // (D) multi-cell tile, trades away an existing tile
  CURSE: 'curse',                           // (E) multi-cell tile, trades away an existing tile
};

export const BOON_RARITY = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
};

// Draft pool — two examples per category from your list. Swap in
// real numbers/effects as you build out the actual buffs; the shape
// (id/name/description/type/rarity/maxOccurrences/effect) is what
// generateBoonOffer() and pickBoon() (js/gameplay/boon.js) rely on.
export const BOON_POOL = [
  // --- A: straight small buffs ---
  {
    id: 'diamond_windfall',
    name: 'Diamond Windfall',
    description: 'Matching diamonds grants +50 bonus score.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: null, // can be picked repeatedly, stacking
    effect: { gem: 'Diamond', bonusScore: 50 },
  },
  {
    id: 'steady_hand',
    name: 'Steady Hand',
    description: '+2 moves at the start of every level.',
    type: BOON_TYPE.BUFF,
    rarity: BOON_RARITY.COMMON,
    maxOccurrences: null,
    effect: { bonusMovesPerLevel: 2 },
  },

  // --- B: powerful buffs with a drawback ---
  {
    id: 'reckless_cascade',
    name: 'Reckless Cascade',
    description: 'Combo growth doubles, but an invalid swap now also costs a move.',
    type: BOON_TYPE.BUFF_WITH_DRAWBACK,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 1,
    effect: { comboStepMultiplier: 2, invalidSwapMovePenalty: 1 },
  },
  {
    id: 'greedy_gambit',
    name: 'Greedy Gambit',
    description: 'Score gained is doubled, but the score target is also doubled.',
    type: BOON_TYPE.BUFF_WITH_DRAWBACK,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 1,
    effect: { scoreMultiplier: 2, scoreTargetMultiplier: 2 },
  },

  // --- C: basic tile construction (single, predetermined position) ---
  {
    id: 'anchor_tile',
    name: 'Anchor Tile',
    description: "Blesses the board's center cell — matches through it score double.",
    type: BOON_TYPE.TILE_BASIC,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 2,
    effect: { tileShape: [[0, 0]], position: 'center', scoreMultiplier: 2 },
  },
  {
    id: 'corner_stash',
    name: 'Corner Stash',
    description: 'Blesses a fixed corner cell — matches through it grant +25 score.',
    type: BOON_TYPE.TILE_BASIC,
    rarity: BOON_RARITY.UNCOMMON,
    maxOccurrences: 2,
    effect: { tileShape: [[0, 0]], position: 'top-left', bonusScore: 25 },
  },

  // --- D: bigger tiles, traded for an existing one ---
  {
    id: 'expansive_vein',
    name: 'Expansive Vein',
    description: 'Blesses a 2x3 area instead of one cell — costs one tile you already placed.',
    type: BOON_TYPE.SLOT_EXPANDED,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 1,
    effect: {
      tileShape: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
      requiresTileRemoval: true,
      scoreMultiplier: 1.5,
    },
  },
  {
    id: 'long_seam',
    name: 'Long Seam',
    description: 'Blesses a 3x1 column instead of one cell — costs one tile you already placed.',
    type: BOON_TYPE.SLOT_EXPANDED,
    rarity: BOON_RARITY.RARE,
    maxOccurrences: 1,
    effect: {
      tileShape: [[0,0],[1,0],[2,0]],
      requiresTileRemoval: true,
      scoreMultiplier: 1.5,
    },
  },
];