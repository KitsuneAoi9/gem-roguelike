// ============================================================
// SPECIAL_GEM.JS — the fixed catalog of special gems.
//
// Same role as boon.js/shop.js: fixed, game-wide data.
// SPECIAL_GEM_TYPE is read by js/gameplay/special_gem.js (decides
// which type a match spawns, and what each type does) and by
// render.js (reads a cell's type off specialGemState.grid to pick a
// CSS class). SPECIAL_GEM_INFO is display-only — nothing reads it
// yet, but it's here so a future "gem guide" UI has real text instead
// of strings hardcoded elsewhere.
//
// REWORKED THIS ROUND — the old single "Flame Gem" (any 4-in-a-row,
// clears row+column together) is now two DIRECTIONAL gems instead,
// so the player can see at a glance which axis it's about to clear:
//
//   - 4 in a HORIZONTAL row -> Laser Beam (Row)    — clears its row only
//   - 4 in a VERTICAL row   -> Laser Beam (Column)  — clears its column only
//   - L or T shape (5+)     -> Star Gem — UNCHANGED: still clears row +
//                              column + both diagonals
//   - 5+ in a straight line -> Hyperspace Star (renamed from
//     "Hypercube") — swap-activated only, never triggers off a normal
//     match. Three swap combos, mirroring Bejeweled:
//       - swap with a normal gem  -> clears every gem of that color
//       - swap with a Laser Beam  -> converts every gem of the
//         laser's color into a Laser (random row/col orientation per
//         gem) and detonates all of them at once
//       - swap with another Hyperspace Star -> clears the ENTIRE board
//   - (new) Laser + Laser swap combo -> clears the full row AND
//     column through the swap's destination cell, regardless of
//     which two orientations were involved
//
// Lives at js/resources/special gem/special_gem.js — note the folder
// has a literal space; import paths must use %20 (see handoff
// gotchas). Distinct from js/gameplay/special_gem.js (plural, logic
// file, one directory over).
// ============================================================

export const SPECIAL_GEM_TYPE = {
  LASER_ROW: 'laser_row',
  LASER_COL: 'laser_col',
  STAR: 'star',
  HYPERSTAR: 'hyperstar',
};

export const SPECIAL_GEM_INFO = {
  [SPECIAL_GEM_TYPE.LASER_ROW]: {
    name: 'Laser Beam (Row)',
    description: 'Made from 4 in a horizontal row. Clears its entire row when matched.',
  },
  [SPECIAL_GEM_TYPE.LASER_COL]: {
    name: 'Laser Beam (Column)',
    description: 'Made from 4 in a vertical row. Clears its entire column when matched.',
  },
  [SPECIAL_GEM_TYPE.STAR]: {
    name: 'Star Gem',
    description: 'Made from an L or T shape. Clears a star burst — row, column, and both diagonals — when matched.',
  },
  [SPECIAL_GEM_TYPE.HYPERSTAR]: {
    name: 'Hyperspace Star',
    description: 'Made from 5 in a straight line. Swap with a normal gem to clear every gem of that color. Swap with a Laser Beam to convert every gem of that color into a Laser and detonate them all. Swap with another Hyperspace Star to clear the entire board.',
  },
};