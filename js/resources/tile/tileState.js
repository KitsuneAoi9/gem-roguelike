// ============================================================
// TILESTATE.JS — mutable, per-run FIELD VARIABLES.
//
// Same role as boonState.js/shopState.js. `installedTiles` is every
// bonus zone the player has constructed this run — cells still hold
// gems normally; a boon or score.js can read this list to apply
// whatever bonus effect you implement for a blessed cell.
// `blockedCells` is every cell the player has deconstructed — board.js
// treats these as permanently empty. No functions here — the logic
// that adds to/clears these lists lives in js/gameplay/tiles.js.
// ============================================================

export const tileState = {
  installedTiles: [], // { id, cells: [[r,c], ...] }[]
  blockedCells: [],   // [r,c][]
};