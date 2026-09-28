# Handoff — Part 12: Consumables Count Toward Events, Queued Level-Up Rewards,
# Configurable Rarity Gates, Negative-Score Decay, Reserved-Boon Exclusion

Continues directly from Part 11. Scope: four requested changes (consumable event
tracking, per-level reward queue when levels are skipped, a tunable rarity-lock table,
negative-score behavior), plus two side fixes found along the way (a missing import and
reserved boons leaking into random event rewards).

---

## 0. File-mapping note

This session delivered edits as snippets/replacement blocks, except `gameplay/boon.js`
(full file). Apply to these project paths:

| Change | Goes to |
|---|---|
| Rarity settings table | `js/resources/constant/constants.js` |
| Full replacement file | `js/gameplay/boon.js` |
| `rollBoonShopOffer()` replacement | `js/gameplay/boon_shop.js` |
| Import + `rollLimitedEditionBoonOffer()` replacement | `js/gameplay/customer_service.js` |
| Multiple replacements (see Sections 3, 4, 6) | `js/gameplay/event.js` |
| Multiple replacements (see Sections 1, 2, 7) | `js/gameplay/main.js` |

---

## 1. Consumables now count toward events

`main.js`'s `handleConsumableTargetClick()` was rewritten. Pickaxe/Dynamite clears now
feed the same tracking a normal swap does:

- **Elite** (`gem_cap` / `gem_subscore_race`): `recordEliteGemActivity([], incidentalCells, 1)`.
  Cleared cells are passed as incidental cells (no formed match), `comboCount: 1`.
- **Silent Vein detonation**: `markChallengeDetonation()` fires if ANY cleared cell holds a
  special gem (targeted directly or reached by chain reaction). Clearing only plain gems
  does NOT count. The check runs before `continueCascadeAfterMatch()`, while
  `specialGemState` still holds those cells.
- **Decaying Birthstone**: `checkDecayingBirthstoneLethal([], incidentalCells)`; if it
  kills the run the handler returns immediately.
- **Dice** needed no change: it already runs through `resolveMatches()`, which does all
  of the above.

Ordering matters: the tracking calls run BEFORE `applyScoreGain()`, since that call may
resolve an Elite on a level-clear.

This closes the "consumables aren't wired into Elite/Challenge/Decaying Birthstone"
gap flagged in Parts 8, 10 and 11.

---

## 2. Queued level-up rewards (skipped levels)

**Problem:** one big score gain can cross several targets (e.g. level 6 to 11). Previously
only one level-up dialog / boon pick appeared, so rewards for the skipped levels were lost.

**Now:** one reward per cleared level, in order, each with its own dialog.

### New state (`main.js`)
- `pendingClearedLevels` — array of every level cleared by the last score gain.
  Filled in `applyScoreGain()` (a `pendingClearedLevels.push(progressionState.level)` line
  right before `advanceLevel()` inside the `while` loop). Reset in `init()`.
- `pendingLevelUpClearedLevel` — which level the currently shown level-up/boon dialog is for.
  Read by the Next Level button listener. Reset in `init()`.

### New / changed functions (`main.js`)
- **`runLevelUpQueue(onAllDone)`** (new) — copies and empties `pendingClearedLevels`, then
  for each level runs: "Level N Cleared!" dialog, boon pick (+ Booner bonus), shop if due,
  tile placement if the boon needs it. After the LAST level, calls `attemptEvent()` once,
  then `onAllDone`.
- **`showLevelUpDialog(clearedLevel, onContinue)`** — signature changed (was `onContinue`
  only). Sets the title to `` `Level ${clearedLevel} Cleared!` `` at runtime.
- **`showBoonDialog(onContinue, clearedLevel, isBonusOffer = false)`** — new 2nd parameter.
- **`maybeGrantBoonerBonusOffer(onDone, clearedLevel)`** — new 2nd parameter.
- **`proceedAfterBoonPick(def, onContinue, clearedLevel)`** — new 3rd parameter. Shop check
  is now `shouldOpenShop(clearedLevel)` (was `progressionState.level - 1`). It NO LONGER
  rolls the event itself.
- **`openShopDialog(onContinue, clearedLevel)`** — new 2nd parameter; shop tier, boon
  offer and Limited Edition slot all derive from it.
- `resolveMatches()`'s deferred level-up branch now calls `runLevelUpQueue()`.
- The `levelUpNextBtn` listener passes `pendingLevelUpClearedLevel` to `showBoonDialog()`.

### Rules confirmed with the user
- Shop rule unchanged (every 5th cleared level), applied PER queued level: a 4 to 11 jump
  visits the shop after level 5's reward AND after level 10's reward.
- "Level Cleared!" dialog shows once per queued level.
- The random event rolls ONCE, after the final queued reward (Elite/Challenge attach to
  the level about to be played).

### Gotcha
`progressionState.level` is already the NEW level (e.g. 11) while queued rewards are being
handed out. Anything gating or pricing a reward must use the `clearedLevel` parameter,
never `progressionState.level`.

---

## 3. Configurable rarity gates

`LEGENDARY_UNLOCK_LEVEL` (constants.js) is **removed**, replaced by:

```js
export const BOON_RARITY_MIN_CLEARED_LEVEL = {
  levelUp: { common: 1, uncommon: 1, rare: 1, epic: 5, legendary: 6 },
  event:   { common: 1, uncommon: 1, rare: 1, epic: 5, legendary: 6 },
  shop:    { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 5 },
};
```

Values are the FIRST **cleared level** whose reward may contain that rarity. Epic is absent
from rewards for clearing levels 1-4; Legendary from levels 1-5. The `shop` row preserves
the old behavior (Legendary from the first shop, after level 5) and is separately tunable.
Keys are plain strings (not `BOON_RARITY`) to avoid a circular import with
`resources/boon/boon.js`.

### `gameplay/boon.js` changes
- New exported **`isRarityAllowed(def, source, clearedLevel)`**; unknown source/rarity means
  "no restriction".
- `isBoonAvailable()` no longer checks the Legendary level. It only checks gem unlock and
  `maxOccurrences`.
- `generateBoonOffer(count, clearedLevel = progressionState.level - 1)` filters by the
  `levelUp` row. A locked rarity rolled by `rollRarity()` finds no candidates and rerolls.
- `generateEqualWeightBoonOffer(count, extraFilter, clearedLevel)` uses the `shop` row.
- `pickBoon()` deliberately does NOT re-check rarity gates (it would wrongly reject queued
  rewards, since the "current level" is ahead of the level being rewarded).
- `boon.js` no longer imports `BOON_RARITY` or `LEGENDARY_UNLOCK_LEVEL`.

### Other callers updated
- `boon_shop.js`: `rollBoonShopOffer(clearedLevel)`.
- `customer_service.js`: `rollLimitedEditionBoonOffer(clearedLevel)` (imports
  `isRarityAllowed`), uses the `shop` row.
- `event.js`:
  - `candidatePoolForRarity(rarity, bypassCap, gateLevel)` uses the `event` row.
  - `findReplacementBoon()` gates at `progressionState.level - 1`.
  - `hasValidChallengeReward(def)` checks the gate at
    `progressionState.level + durationLevels - 1` (the level the reward is granted on).
  - **New `hasEligibleEliteReward(def)`**: an Elite whose win is `grant_boons` (Boon Hoarder)
    is only offered if its reward pool is non-empty at the current level. `hasEligibleElite()`
    and `pickEliteDef()` both use it, so the Epic lock can't let the player "win" nothing.
  - `applyEliteOutcomeEffect()` `grant_boons` gates at `progressionState.level` (the level
    being cleared; `advanceLevel()` hasn't run yet).
  - `resolveLostMinerAbsorb()` calls `generateBoonOffer(1, progressionState.level - 1)`.
  - `checkChallengeLevelClear()` gates normal rewards at `progressionState.level`.
- **Event-only rewards (Overcharge Essence from Test of Endurance) are exempt** from the gate,
  otherwise the challenge would give nothing before level 6.

---

## 4. Negative score

- **Shop:** no change needed. Every purchase already checks `score < price`, so a player
  who can't afford something can't buy it (no debt).
- **A Test of Endurance decay:** `applyChallengeDecayIfDue()` now uses
  `Math.round(Math.abs(workingScore) * percent)`, so the deduction is always positive and
  the score keeps sinking (-100 to -105 to ...). Before, a negative score produced a negative
  "deduction" that `main.js` ignored (and would have raised the score if applied). `main.js`'s
  `applyChallengeDecayIfActive()` needed no change.
- **Percent effects** (Crystallized Parasite, Perpetual Boon, Gem Cultivator, Lost Miner
  help, Fortune's Folly): unchanged. They only fire after a level clear or a positive-score
  gate, and you can't clear a level while negative.

---

## 5. Reserved boons excluded from random event rewards (bugfix)

`candidatePoolForRarity()` and `findReplacementBoon()` didn't exclude `EVENT_ONLY_BOON_IDS`
or `SHOP_ONLY_BOON_IDS`, so Silent Vein's "Legendary" reward could be VIP Membership Card or
Overcharge Essence, and a Gem Mole trade could hand out Booner.

Fix (`gameplay/event.js` only):
- `SHOP_ONLY_BOON_IDS` added to the resources import.
- New helper **`isReservedBoon(def)`**: true for `perpetual_boon`, `EVENT_ONLY_BOON_IDS`,
  `SHOP_ONLY_BOON_IDS`. Called from both functions above.
- `candidatesFromEventOnlyPool()` is intentionally untouched (it draws FROM the event-only set).
- Side effect: `hasValidChallengeReward()` now requires a real normal-pool Legendary, so
  VIP Membership Card no longer makes the pool look non-empty.

---

## 6. Other fix

`main.js` used `GOLDEN_TICKET_TURNS` in `activateGoldenTicketConsumable()` and
`updateGoldenTicketStatus()` without importing it (a ReferenceError on first Golden Ticket
use). Import changed to:
`import { CONSUMABLE_INFO, CONSUMABLE_TYPE, GOLDEN_TICKET_TURNS } from '../resources/consumable/consumable.js';`

---

## Known gaps / flagged simplifications

- **`isReservedBoon()` duplicates `boon.js`'s non-exported `isExcludedFromNormalOffers()`.**
  If they drift, export the boon.js one and import it into event.js.
- **Reserved boons can still be traded AWAY** in the Gem Mole trade; only the received boon
  is restricted. Add a filter to `hasValidEncounterCandidate()` / `eligibleHeldBoons` if
  that should change.
- **Golden Ticket doubles negative gains too** (it doubles whatever `gained` is).
- **`hasValidChallengeReward()`'s gate level** (`level + durationLevels - 1`) is an
  approximation of the level the reward is eventually granted on.
- **Text:** `DIALOG_TITLES.LEVEL_UP` in `text.js` is now only the initial title;
  `showLevelUpDialog()` overwrites it with an interpolated string per level.
- **Still open from earlier parts:** Decaying Birthstone / Petrified have no grant trigger;
  a board reshuffle wipes Obsidian; area-based blasts can still clear a Hyperstar.
- `GAME_VERSION` in `text.js` was not bumped this session.