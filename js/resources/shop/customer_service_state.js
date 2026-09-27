// ============================================================
// CUSTOMER_SERVICE_STATE.JS — mutable FIELD VARIABLE for the shop's
// Customer Service section (Curse Removal Service / Limited Edition
// Boons Sale Service).
//
// `curseRemovalUseCount` is PER-RUN (only reset on "start over" —
// see gameplay/customer_service.js's resetCustomerService()), since
// its price tier ("first time... second time... third time onwards")
// is explicitly a lifetime count, not a per-visit one.
//
// `usedThisVisit` and `limitedEditionBoonId` are PER-VISIT — reset
// every time the shop opens (see resetCustomerServiceVisit()), same
// as boonShopState.offer/consumableShopState.offer already are.
// ============================================================

export const customerServiceState = {
  curseRemovalUseCount: 0,     // persists for the whole run
  usedThisVisit: false,        // only ONE of the two services can be used per visit
  limitedEditionBoonId: null,  // the one shop-only boon rolled for this visit, or null if none available
};