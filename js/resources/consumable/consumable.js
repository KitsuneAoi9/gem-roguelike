// ============================================================
// CONSUMABLE.JS (resources) — the fixed consumable-item catalog.
// Same role as boon.js/special_gem.js (resources): fixed, game-wide
// data only, no functions (Rule 6).
// ============================================================

export const CONSUMABLE_TYPE = {
  PICKAXE: 'pickaxe',
  DYNAMITE: 'dynamite',
  DICE: 'dice',
  GOLDEN_TICKET: 'golden_ticket',
  RESURRECTION_CROSS: 'resurrection_cross',
};

// `pricePercent` is a PERCENT of the score the player had when they
// ENTERED the shop (the same shopEntryScore snapshot the boon shop
// already takes — see main.js's openShopDialog()) — not a flat
// price, and not tied to the live/current score.
//
// `requiresTarget: true` means clicking the belt slot arms
// "targeting mode" and the NEXT board click applies the effect there
// (Pickaxe/Dynamite). `requiresTarget: false` + no `passive` flag
// means it activates immediately on click (Dice/Golden Ticket).
// `passive: true` means it can't be clicked at all — it auto-triggers
// on its own at a specific game event (Resurrection Cross, on a
// would-be deadlock game-over — see main.js's checkEndState()).
export const CONSUMABLE_INFO = {
  [CONSUMABLE_TYPE.PICKAXE]: {
    name: 'Pickaxe',
    file: 'pickaxe.svg',
    description: 'Destroy one gem on the board. Triggers any special gem hit — a Hyperspace Star destroys every gem of one random type instead.',
    pricePercent: 0.10,
    requiresTarget: true,
  },
  [CONSUMABLE_TYPE.DYNAMITE]: {
    name: 'Dynamite',
    file: 'dynamite.svg',
    description: 'Detonate a 3\u00d73 area on the board. Triggers any special gem caught in the blast — a Hyperspace Star destroys every gem of one random type instead.',
    pricePercent: 0.20,
    requiresTarget: true,
  },
  [CONSUMABLE_TYPE.DICE]: {
    name: 'Dice',
    file: 'dice.svg',
    description: "Shuffle every gem color on the board. Special gems stay on the same cells, but a Laser/Discharger's own underlying color can change.",
    pricePercent: 0.20,
    requiresTarget: false,
  },
  [CONSUMABLE_TYPE.GOLDEN_TICKET]: {
    name: 'Golden Ticket',
    file: 'golden_ticket.svg',
    description: 'Doubles all score gained for your next 9 turns (one turn = one swap and its full cascade).',
    pricePercent: 0.30,
    requiresTarget: false,
  },
  [CONSUMABLE_TYPE.RESURRECTION_CROSS]: {
    name: 'Resurrection Cross',
    file: 'resurrection_cross.svg',
    description: "Automatically reshuffles the board instead of ending your run the next time you'd be stuck with no legal moves. Triggers on its own — it can't be used manually.",
    pricePercent: 0.60,
    requiresTarget: false,
    passive: true,
  },
};

export const CONSUMABLE_BELT_SIZE = 3;        // how many items the belt can hold at once
export const CONSUMABLE_SHOP_OFFER_COUNT = 3; // how many DISTINCT types the shop offers per visit
export const GOLDEN_TICKET_TURNS = 9;         // how many turns Golden Ticket's 2x lasts