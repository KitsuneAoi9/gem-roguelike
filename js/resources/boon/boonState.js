// ============================================================
// BOONSTATE.JS — mutable, per-run FIELD VARIABLES.
//
// Same role as progressionState: holds what's true right now, not
// what's fixed forever. `activeBoons` is the list of boons the
// player has actually picked this run — score.js/main.js read it to
// apply whatever effects you implement. No functions here — the
// logic that adds to/clears this list lives in js/gameplay/boon.js.
// ============================================================

export const boonState = {
  activeBoons: [], // ActiveBoon[] — see js/gameplay/boon.js for the shape
};