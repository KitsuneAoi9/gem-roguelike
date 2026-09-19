// ============================================================
// GEM_UNLOCK_STATE.JS — mutable FIELD VARIABLE, NOT reset per-run.
//
// Whether each gem id is unlocked — gates that gem's boons out of
// generateBoonOffer() (js/gameplay/boon.js) while locked. This is
// meta-progression, not run-progression: unlike boonState/
// gemBaseState/etc. it deliberately survives "start over", same as
// a tech tree would. There is no research system yet, so the four
// future gems just stay false with no way to flip them true — this
// is a stub for that future system.
// ============================================================

export const gemUnlockState = {
  unlocked: {
    amethyst: true,
    diamond: true,
    emerald: true,
    garnet: true,
    ruby: true,
    sapphire: true,
    topaz: true,
    onyx: false,
    aquamarine: false,
    bloodstone: false,
    pearl: false,
  },
};