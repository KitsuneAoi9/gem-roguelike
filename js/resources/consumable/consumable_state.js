// ============================================================
// CONSUMABLE_STATE.JS — mutable, per-run FIELD VARIABLE.
//
// `inventory` is every consumable the player currently holds — up to
// CONSUMABLE_BELT_SIZE (3) at once, one belt slot each, in the order
// they were picked up. No functions here — see js/gameplay/consumable.js.
// ============================================================

export const consumableState = {
  inventory: [], // { pickId: number, type: string }[]
};