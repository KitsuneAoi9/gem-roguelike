// ============================================================
// CONSUMABLE_SHOP_STATE.JS — mutable, per-shop-visit FIELD VARIABLE.
//
// Same role as boon_shop_state.js, but for the consumable side of the
// SAME shop dialog: which CONSUMABLE_TYPE ids are on offer this visit
// (always 3 distinct types, rerolled fresh every time the shop
// opens), and which of them have already been bought this same visit.
// ============================================================

export const consumableShopState = {
  offer: [],           // CONSUMABLE_TYPE ids currently on offer (always distinct)
  purchasedTypes: [],  // string[] — types from `offer` already bought this visit
};