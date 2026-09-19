// ============================================================
// SHOP_STATE.JS — mutable, per-run FIELD VARIABLES.
//
// Same role as boon_state.js: holds what's true right now, not what's
// fixed forever. `inventory` is every item the player currently owns
// (artifacts/relics/fossils never leave it; consumables do once
// you've implemented "using" one). `seenItemIds` is every non-
// consumable item id that has ever been offered in a shop — once an
// id is in here, generateShopOffer() (js/gameplay/shop.js) will never
// offer it again. No functions here.
// ============================================================

export const shopState = {
  inventory: [],    // OwnedItem[] — see js/gameplay/shop.js for the shape
  seenItemIds: [],  // string[] — non-consumable ids already offered once
};