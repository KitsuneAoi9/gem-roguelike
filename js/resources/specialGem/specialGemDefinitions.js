// ============================================================
// SPECIALGEMDEFINITIONS.JS — the fixed catalog of special gems.
//
// Same role as boonDefinitions.js/shop.js: fixed, game-wide data.
// SPECIAL_GEM_TYPE is read by js/gameplay/specialGems.js (decides
// which type a match spawns, and what each type does) and by
// render.js (reads a cell's type off specialGemState.grid to pick a
// CSS class). SPECIAL_GEM_INFO is display-only — nothing reads it
// yet, but it's here so a future "gem guide" UI has real text instead
// of strings hardcoded elsewhere.
//
// These three, and the trigger shapes that spawn them, mirror
// Bejeweled's special gems:
//   - 4 in a straight line  -> Flame Gem   (clears its row + column)
//   - L or T shape (5+)     -> Star Gem    (clears a star burst: row +
//                                          column + both diagonals)
//   - 5+ in a straight line -> Hypercube   (swap with any gem to clear
//                                          every gem of that type)
// ============================================================

export const SPECIAL_GEM_TYPE = {
  FLAME: 'flame',
  STAR: 'star',
  HYPERCUBE: 'hypercube',
};

export const SPECIAL_GEM_INFO = {
  [SPECIAL_GEM_TYPE.FLAME]: {
    name: 'Flame Gem',
    description: 'Made from 4 in a row. Clears its entire row and column when matched.',
  },
  [SPECIAL_GEM_TYPE.STAR]: {
    name: 'Star Gem',
    description: 'Made from an L or T shape. Clears a star burst — row, column, and both diagonals — when matched.',
  },
  [SPECIAL_GEM_TYPE.HYPERCUBE]: {
    name: 'Hypercube',
    description: 'Made from 5 in a straight line. Swap it with any gem to clear every gem of that type from the board.',
  },
};

// TODO: real Bejeweled also has combo behavior when two special gems
// are swapped together (e.g. two Hypercubes clear the whole board).
// Not implemented — js/gameplay/specialGems.js's Hypercube trigger
// just treats whatever it's swapped with as "the target type," even
// if that gem happens to be special too.