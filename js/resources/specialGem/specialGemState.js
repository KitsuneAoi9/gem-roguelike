// ============================================================
// SPECIALGEMSTATE.JS — mutable, per-run FIELD VARIABLE.
//
// Same role as boonState.js/shopState.js/tileState.js. `grid` is a
// SIZE x SIZE overlay parallel to main.js's own `grid` — each cell is
// either null (an ordinary gem) or a SPECIAL_GEM_TYPE value. Kept
// separate from the main grid (which only ever holds a gem-type
// number, -1, or BLOCKED) so board.js doesn't need to know anything
// about special gems to stay pure grid logic. No functions here — the
// logic that reads/writes this lives in js/gameplay/specialGems.js.
//
// Starts empty ([]) rather than pre-sized, since sizing it needs SIZE
// from board.js — a gameplay module resources/ shouldn't import.
// resetSpecialGems() (js/gameplay/specialGems.js) builds the actual
// SIZE x SIZE grid; call it from main.js's init() before anything
// reads specialGemState.grid.
// ============================================================

export const specialGemState = {
  grid: [], // SPECIAL_GEM_TYPE | null, SIZE x SIZE — see resetSpecialGems()
};