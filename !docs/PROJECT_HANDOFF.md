# PROJECT_HANDOFF --- Browser Match-3 Roguelike

## 1. Project overview

A browser-based roguelike/high-score match-3 prototype built with
JavaScript, HTML, and CSS.

-   **Run:** serve the project through a local HTTP server and open
    `index.html`.
-   **Current architecture goal:** keep game data/state separate from
    gameplay logic; keep `main.js` responsible for orchestration rather
    than complicated rules.
-   **Board:** allocated at 20×20 (`MAX_BOARD_SIZE`), with an initially
    usable 8×8 area. Blocked cells define the active board shape.
-   **Progression:** clear score targets to advance levels; level-up
    rewards are queued so skipped levels do not lose their rewards.
-   **Run reset:** boon/curse/effect/consumable/event state is
    run-scoped unless explicitly documented otherwise. Gem unlock state
    is intended as meta-progression.

## 2. Current project structure

### `js/resources/`

Data/state only.

Important areas: - `constant/` --- fixed mechanic values and user-facing
text. - `boon/` --- boon definitions and boon/effect state. - `curse/`
--- curse definitions and curse state. - `consumable/` --- item
definitions and inventory state. - `event/` --- event definitions and
event state. - `shop/` --- shop definitions/state, including boon shop
and customer service.

### `js/gameplay/`

Runtime logic.

Key modules: - `board.js` --- pure grid/move/match/collapse logic. -
`render.js` --- board DOM rendering. - `main.js` --- orchestration, UI
flow, state transitions. - `score.js` --- scoring pipeline. -
`progression.js` --- level progression. - `gem_base.js` --- current
per-gem base score/multiplier access. - `boon.js` / `boon_effects.js`
--- offer/pick logic vs. effect application. - `curse.js` --- curse
grant/removal/tracking. - `event.js` --- event selection and
resolution. - `special_gem.js` --- special-gem behavior and blast
logic. - `obsidian.js` --- Obsidian settling/off-board behavior. -
`consumable.js` / `consumable_shop.js` --- item behavior and shop
logic. - `boon_shop.js` --- boon shop pricing/offer logic. -
`customer_service.js` --- curse removal and Limited Edition boon
service.

## 3. Architecture rules

1.  **Keep comments proportional to complexity.** Complicated systems
    deserve explanatory comments; simple code should stay light.
2.  **`board.js` stays pure.** It must not know about DOM, scoring, or
    special-gem behavior.
3.  **`render.js` owns board DOM access.**
4.  **Keep `main.js` orchestration-focused.** Move complicated reusable
    logic into dedicated gameplay modules.
5.  **One concern per module.**
6.  **Resources contain data/state, not gameplay functions.**
    Resource-to-resource data imports are acceptable when they avoid
    duplicated definitions.
7.  **Separate numbers from wording.**
    -   mechanics → `constants.js`
    -   fixed scoring defaults → base-score resources
    -   fixed UI wording → `text.js`
    -   interpolated UI text → gameplay/UI layer
8.  **Board placement mechanics remain isolated.** The old button-driven
    construction system was replaced by expand/shrink plumbing; its boon
    entry points are currently dormant because the board-shape boons
    were removed from the pool.
9.  **Special gems are a metadata overlay.** The main grid stores the
    underlying gem color/type; special-gem identity is held separately
    in `specialGemState`.
10. **Naming:** multi-word files use `snake_case`; multi-word folder
    names use the existing literal-space convention, with encoded spaces
    in imports.
11. **Boon effects are data-driven.** New effect shapes should use
    `effect.kind` and be dispatched centrally through `boon_effects.js`,
    rather than branching on individual boon IDs throughout the code.

## 4. Current gameplay flow

1.  Start a run.
2.  The board starts as an 8×8 usable region inside the 20×20
    allocation.
3.  Player swaps adjacent usable cells.
4.  Normal matches and special-gem combinations resolve into cascades.
5.  Score is added through the centralized scoring pipeline.
6.  Score gains may cross multiple targets.
7.  Every cleared level is queued and receives its own:
    -   Level Cleared dialog
    -   boon pick
    -   Booner bonus offer, if applicable
    -   shop visit when the cleared level is a shop level
8.  After the final queued reward, one random event is rolled.
9.  The next level begins.

### Important skipped-level rule

If one score gain clears several levels, rewards are processed in
cleared-level order. Shop cadence is also checked per cleared level. The
random event is rolled **once after the final queued reward**, not once
per skipped level.

Use the explicit `clearedLevel` being rewarded for reward/shop/rareness
decisions; `progressionState.level` has already advanced.

## 5. Target score

Current target calculation uses the milestone-scaled formula:

``` text
base(level)
  = ROUND(1000 × 1.15^(level-1)) × level
    + 500 × 1.05^level

milestoneFactor
  = 1.10 ^ FLOOR((level-1) / 5)

target(level)
  = ROUND(
      base(level)
      × milestoneFactor
      × boonEffectState.targetScoreMultiplier
    )
```

Milestone scaling increases every five levels.

## 6. Current rarity gates

`LEGENDARY_UNLOCK_LEVEL` is no longer used. Rarity gates are
configurable:

``` js
BOON_RARITY_MIN_CLEARED_LEVEL = {
  levelUp: { common: 1, uncommon: 1, rare: 1, epic: 5, legendary: 6 },
  event:   { common: 1, uncommon: 1, rare: 1, epic: 5, legendary: 6 },
  shop:    { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 5 },
};
```

The gate is based on the **cleared level being rewarded**, not merely
the current progression level.

Event-only rewards are exempt where explicitly intended (for example,
Overcharge Essence from A Test of Endurance).

## 7. Current score behavior

The final two global steps are now:

``` text
finalScore = (afterFlatBonuses + globalScoreBonus)
             × globalScoreMultiplier
```

Global flat bonus is therefore added before the global multiplier.

Negative scores are allowed. A Test of Endurance's percentage decay uses
the absolute value of the working score so a negative score continues
moving downward rather than accidentally increasing.

## 8. Current loss/deadlock behavior

A run can end through the configured lose conditions or a lethal curse.

When the board has no valid moves, `handleDeadlock()` evaluates the
situation:

-   No Resurrection Cross → normal deadlock handling / prevention
    behavior.
-   Cross only → Cross activates directly.
-   Cross + Pickaxe/Dynamite/Dice → player is offered the choice to use
    another board-changing consumable first.
-   After a consumable, `checkEndState()` evaluates the situation again.

`PREVENT_DEADLOCK` remains available as a separate mode.

## 9. Important dormant/unfinished systems

These are intentionally not treated as active gameplay just because
supporting code still exists:

-   Board-shape boon entries were removed from the current boon pool.
    Expand/shrink plumbing remains dormant.
-   Decaying Birthstone and Petrified are now grantable (via the
    Meditating Elf and To Open or To Not Open random-curse pool). They
    are no longer dormant.
-   The older artifact/relic/fossil shop remains dormant; the active
    shop is the boon/consumable/customer-service shop.
-   `markBonusTile()` / installed bonus-tile scoring remains dormant.
-   Moves-limit mode remains shelved behind its flag.
-   Real gem-unlock/research progression is not implemented.
-   Luck-based rarity adjustment is not implemented.

## 10. Current known gaps

-   Board reshuffles rebuild the grid and wipe existing Obsidian.
-   Area-based blasts can still clear a Hyperstar caught in their
    physical blast area (it fires its random wipe first).
-   Frantic Star's second random-color wipe is folded into the primary
    matched-group scoring.
-   Chain-reaction expansion exists in three places
    (`resolveSpecialGems()`, `expandConsumableBlast()`,
    `expandChainReaction()`); it has not been unified.
-   `isReservedBoon()` (event.js) duplicates boon.js's non-exported
    `isExcludedFromNormalOffers()`. Export and import it if they drift.
-   Reserved boons (Booner, VIP) can be traded away by the Gem Mole and
    can be picked as the Mimic's victim.
-   `pickObsidianTargetCell()` is dead code.
-   `forceFailChallenge()` exists but is not called anywhere. A
    "failsOnDeadlock" flag mentioned in comments is not implemented.

## 11. Gotchas

-   **Serve over HTTP.** ES modules will not load from `file://`.
-   **`%20` in imports** for space-named folders (`special gem`, `base value`).
-   **`resetBoonEffects()` must run before `resetProgression()`**, because the target reads `targetScoreMultiplier`.
-   **`gemUnlockState` is NOT reset on "start over"** (meta-progression).
-   **`effect.gem` doubles as the gem-unlock gate.** Do not add it to a boon that should always be available.
-   **`pickBoon()` and `applyBoonEffect()` are separate.** Do both, or caps and effects desync.
-   **`NaN` never self-heals.** Guard optional numeric fields in new `boon_effects.js` cases with `|| 0`.
-   **Negative score is allowed.** Do not add `Math.max(0, ...)`.
-   **`matchedGroups` reports the original match length**, not the post-spawn cleared count. Do not "fix" this.
-   **`gemType` (numeric, board) vs `gemId` (string, boon/base systems).** Convert only via `gemIdForType()`.
-   **`resolveMatches(swapCells)` is almost always `null`.** Only `attemptSwap()`'s normal-match branch passes swap cells. Any new post-swap path must pass them or spawn placement silently falls back.
-   **Use `clearedLevel`, never `progressionState.level`**, for reward/shop/rarity decisions.
-   **Shop and free picks share `maxOccurrences`** on purpose.
-   **Rarity/level gating belongs in `isRarityAllowed()`/`isBoonAvailable()`**, not per caller.
-   **`CURSE_POOL[0]` must remain Weight of Greed.**
-   **Elite `time_race` doubling is temporary** (`advanceLevel()` overwrites it). `target_percent` is permanent.
-   **`html { font-size: 18px }`** scales all rem sizes. Flat-px sizes (69px cells, special-gem overlays) do not scale.
-   **`render.js`'s cell size (69px) must match `layout.css`'s `.cell`.**
-   **`index.html` needs `class="event-story"`** on `#event-story` for its CSS to apply.
-   **Event text may contain HTML** (named-effect spans), so it renders via `innerHTML`. Keep all such strings sourced from static data.