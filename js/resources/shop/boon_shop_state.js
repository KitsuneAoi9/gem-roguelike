// ============================================================
// BOON_SHOP_STATE.JS — mutable, per-shop-visit FIELD VARIABLE.
//
// Same role as boon_state.js, but scoped to ONE shop visit rather
// than the whole run: `offer` is the boons currently on the shelf
// (rerolled fresh every time the shop opens), `purchasedIds` is
// which of THIS offer's ids have already been bought this visit, so
// a card can't be double-bought. Neither needs a "start over" reset
// entry — a fresh run always starts with the shop closed — but
// gameplay/boon_shop.js's resetBoonShop() clears both anyway, for
// safety against a "start over" mid-visit.
// ============================================================

export const boonShopState = {
  offer: [],         // BOON_POOL entries currently on offer
  purchasedIds: [],  // string[] — ids from `offer` already bought this visit
};