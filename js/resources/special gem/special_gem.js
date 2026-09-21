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
// RENAMED THIS ROUND — the old "Star Gem" (L/T shape, cleared a row+
// column+diagonals burst on match) is now the DISCHARGER, and its
// behavior split across two situations instead of one fixed effect:
//
//   - Matched normally (part of a formed match, or hit by a
//     chain-reaction blast) -> clears a 3x3 area centered on itself.
//     This REPLACES the old row+column+diagonals burst as the
//     passive on-match effect.
//   - Swapped with a Laser Beam -> clears 3 full rows (if the laser
//     was a LASER_ROW) or 3 full columns (if LASER_COL), centered on
//     wherever the Discharger itself ends up after the swap — instead
//     of the laser's usual single row/column.
//   - Swapped with another Discharger -> the OLD row+column+diagonals
//     burst, centered on the swap's destination cell. (i.e. the
//     original Star Gem behavior now lives here, swap-exclusive.)
//   - Swapped with a Hyperspace Star -> mirrors the Hyperstar+Laser
//     combo: converts every gem of the Discharger's color into a
//     Discharger and detonates them all (each with its own 3x3).
//
// Everything else is unchanged from the prior round:
//   - 4 in a HORIZONTAL row -> Laser Beam (Row)    — clears its row only
//   - 4 in a VERTICAL row   -> Laser Beam (Column)  — clears its column only
//   - L or T shape (5+)     -> Discharger (see above)
//   - 5+ in a straight line -> Hyperspace Star — swap-activated only.
//   - Laser + Laser swap combo -> clears the full row AND column
//     through the swap's destination cell.
//
// Lives at js/resources/special gem/special_gem.js — note the folder
// has a literal space; import paths must use %20 (see handoff
// gotchas). Distinct from js/gameplay/special_gem.js (plural, logic
// file, one directory over).
// ============================================================

export const SPECIAL_GEM_TYPE = {
  LASER_ROW: 'laser_row',
  LASER_COL: 'laser_col',
  DISCHARGER: 'discharger', // renamed from STAR/'star' this round
  HYPERSTAR: 'hyperstar',
};

export const SPECIAL_GEM_INFO = {
  [SPECIAL_GEM_TYPE.LASER_ROW]: {
    name: 'Laser Beam (Row)',
    description: 'Made from 4 in a horizontal row. Clears its entire row when matched. Swap with a Discharger to clear 3 rows instead of 1.',
  },
  [SPECIAL_GEM_TYPE.LASER_COL]: {
    name: 'Laser Beam (Column)',
    description: 'Made from 4 in a vertical row. Clears its entire column when matched. Swap with a Discharger to clear 3 columns instead of 1.',
  },
  [SPECIAL_GEM_TYPE.DISCHARGER]: {
    name: 'Discharger',
    description: "Made from an L or T shape. Clears a 3x3 area centered on itself when matched. Swap with a Laser Beam to clear 3 rows or 3 columns (matching the laser's orientation) instead of a single row/column. Swap with another Discharger to clear a burst — row, column, and both diagonals. Swap with a Hyperspace Star to convert every gem of its color into a Discharger and detonate them all.",
  },
  [SPECIAL_GEM_TYPE.HYPERSTAR]: {
    name: 'Hyperspace Star',
    description: 'Made from 5 in a straight line. Swap with a normal gem to clear every gem of that color. Swap with a Laser Beam to convert every gem of that color into a Laser and detonate them all. Swap with a Discharger to convert every gem of that color into a Discharger and detonate them all. Swap with another Hyperspace Star to clear the entire board.',
  },
};