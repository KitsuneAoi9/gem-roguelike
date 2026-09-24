# Handoff — Part 8: Consumable Items System (Belt, Shop, 5 Item Types)

Continues directly from Part 7. Scope: a brand-new consumable-items system — a 3-slot
belt UI, a second shop section selling 3 always-distinct consumable types per visit, and
five item effects (Pickaxe, Dynamite, Dice, Golden Ticket, Resurrection Cross).

---

## 1. New state — resources

- **`resources/consumable/consumable.js`** — the fixed catalog. `CONSUMABLE_TYPE` enum,
  `CONSUMABLE_INFO` (name/icon file/description/`pricePercent`/`requiresTarget`/`passive`
  per type), plus `CONSUMABLE_BELT_SIZE` (3), `CONSUMABLE_SHOP_OFFER_COUNT` (3),
  `GOLDEN_TICKET_TURNS` (9).
- **`resources/consumable/consumable_state.js`** — `consumableState.inventory` — every
  item currently held, one belt slot each (`{ pickId, type }`), non-stacking (two
  Pickaxes take two separate slots).
- **`resources/shop/consumable_shop_state.js`** — mirrors `boon_shop_state.js`: this
  visit's `offer` (always 3 distinct types) + `purchasedTypes`.

## 2. New gameplay logic

- **`gameplay/consumable.js`** — inventory bookkeeping (`addConsumableToInventory()`/
  `removeConsumableFromInventory()`/`findFirstConsumableOfType()`/`hasBeltSpace()`/
  `resetConsumables()`), plus the actual board-mutation effects for Pickaxe/Dynamite/Dice.
- **`gameplay/consumable_shop.js`** — offer generation (`rollConsumableShopOffer()`,
  guaranteed 3 distinct types via a shuffle-and-take of the whole catalog rather than 3
  independent rolls), pricing (`calculateConsumablePrice()` — a percent of `shopEntryScore`,
  the same "score at shop-open" snapshot the boon shop already uses), purchase bookkeeping.
- **`gameplay/special_gem.js`** — three internal helper functions (`laserRowBlastCells()`,
  `laserColBlastCells()`, `dischargerBlastCells()`) are now `export`ed, so `consumable.js`
  can reuse the EXACT same blast shapes for Pickaxe/Dynamite's chain reactions — single
  source of truth for "what does each special's blast look like" preserved.

## 3. Belt UI

New `.board-and-belt` flex row wraps `#board-wrap` and a new `#consumable-belt` (3 fixed
`.belt-slot` divs) side by side — "next to the board," per the ask. `renderConsumableBelt()`
(main.js) rebuilds all 3 slots from `consumableState.inventory` on every relevant state
change (purchase, use, init). A filled slot shows the item's SVG icon (`background-image`,
same convention gems/boon cards use) and gets a gold border; hovering shows a tooltip with
the item's name + full description (`data-tooltip` + a plain `::after` box, positioned to
the RIGHT of the slot — no clipping risk here since the belt has no `overflow`-clipping
ancestor, unlike the side-stats/History tooltips from Parts 6–7).

## 4. Shop integration

The SAME shop dialog/visit now shows a second "Consumables" section below the boon cards
— `openShopDialog()` calls `rollConsumableShopOffer()` alongside `rollBoonShopOffer()`;
`renderShopDialog()` builds a second row of cards from `consumableShopState.offer`.
Pricing is fixed at shop-open (`shopEntryScore x pricePercent`), affordability checked
against the LIVE score (same split the boon shop already uses). A card also greys out
("Belt full") when `hasBeltSpace()` is false, independent of affordability.

## 5. The five items

| Item | Trigger | Effect |
|---|---|---|
| **Pickaxe** | click belt slot → click a board cell | Destroys that one cell. If it held a Laser/Discharger, that special's own blast shape fires (reused from `special_gem.js`). If it held a Hyperstar, triggers a board-wide wipe of one RANDOM gem type instead (no swap partner to take a color from) — and, per the Part 6 rule, never incidentally destroys a DIFFERENT Hyperstar caught in the sweep. |
| **Dynamite** | click belt slot → click a board cell | Same chain-reaction rules as Pickaxe, but the initial target is a 3×3 area centered on the clicked cell (off-board/blocked cells in that area are just skipped) instead of one cell. |
| **Dice** | click belt slot (no target needed) | Fisher-Yates shuffle of every USABLE cell's CURRENT color (a real permutation, not fresh re-rolls) — `specialGemState` untouched, so every special gem stays on exactly the cell it was already on; only the color underneath a Laser/Discharger can change as a result. Any match the shuffle happens to create is allowed to cascade normally (not guarded against — a nice bonus). |
| **Golden Ticket** | click belt slot (no target needed) | Doubles ALL score gained for the next 9 completed player-swap turns. Reactivating while one is already active RESETS the counter to 9 rather than stacking. |
| **Resurrection Cross** | passive — never clickable | Auto-consumes itself the moment `checkEndState()` would otherwise show the no-moves game-over dialog, and reshuffles the board instead (checked BEFORE the `PREVENT_DEADLOCK` flag, so it saves a run even in "hard mode"). |

### Golden Ticket mechanics, in detail

`applyScoreGain(gained, popupText)` doubles `gained` right at the top, AFTER the caller has
already fully computed it via `calculateCascadeStepScore()` — "after everything is
calculated," per spec — and this one spot covers every score-gain call site in the game
(matches, all 7 swap combos, consumable clears) for free.

The 9-turn counter itself only decrements for a REAL player swap, not a consumable action,
even though several consumables (Dice, Pickaxe, Dynamite) route through the exact same
`resolveMatches()`/cascade machinery a swap does. Mechanism: `pendingGoldenTicketTurn` is
set `true` at the very top of `attemptSwap()` (every real swap attempt), cleared
immediately if the swap turns out invalid (never even reaches `resolveMatches()`), and
otherwise consumed exactly once — inside `resolveMatches()`'s `!hasAnyMatch` settle branch
— the moment that swap's WHOLE cascade (however many combo/chain steps) finishes. Consumable
actions never set this flag, so their own trip through `resolveMatches()` doesn't
accidentally burn a turn.

---

## Known gaps / flagged simplifications

- **Pickaxe/Dynamite are NOT wired into Elite gem-tracking or Challenge detonation-tracking**
  (`recordEliteGemActivity()`/`markChallengeDetonation()`). Deliberately skipped rather than
  half-implemented — Challenge's "no detonation" rule specifically means "a special gem
  fired," and a consumable can clear plain gems with no special involved at all; wiring this
  in naively risked incorrectly failing an active Challenge. Revisit if you want consumables
  to interact with active Elite/Challenge modifiers.
- **Consumable-triggered clears always score as flat incidental cells**, even when a chain
  reaction sweeps up a Hyperstar (which, via a real swap, gets the favorable "matched group"
  match-size-multiplier treatment instead). Simpler and consistent; a deliberate scope cut,
  not an oversight.
- **`calculateConsumablePrice()` can price out to 0** if `shopEntryScore` is 0 at shop-open
  (a purely theoretical very-early-game edge case) — no price floor added.
- **No discard option** — per this round's explicit ask ("for the time being, don't allow
  the player to discard the consumable item"). A full belt simply blocks further purchases
  of ANY type until an item is used.
- **SVG icons are original placeholder art** (simple flat vector shapes in the game's
  existing dark/gold palette) — easy to swap for real art later without touching any code,
  since every reference goes through `CONSUMABLE_INFO[type].file`.
