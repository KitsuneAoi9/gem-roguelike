// ============================================================
// CURSE_STATE.JS — mutable, per-run FIELD VARIABLE.
//
// Deliberately its OWN list, separate from boonState.activeBoons,
// even though a curse's effect is currently applied through the
// exact same applyBoonEffect()/reverseBoonEffect() machinery a boon
// uses (see gameplay/curse.js) — this is the minimal real foundation
// for a future full curse system (its own UI panel, its own removal
// mechanics), which needs its own list to grow into rather than being
// tangled permanently into the boon list.
// ============================================================

export const curseState = {
  activeCurses: [], // { pickId, id, pickedAtLevel, appliedEffect }[]
};