# Handoff — Part 4

Continues directly from Parts 1–3. Original scope of this part: drag-to-swap, the stuck-board game-over dialog, the deferred level-up dialog (+ a `busy` bugfix), boon-card and Gem-Stats gem icons, the Star→Discharger rework, and the hint feature. Architecture Rules 1–11 (Part 1) are unchanged and still govern all of this.

**This version of Part 4 also folds in a full follow-up session** (originally tracked as a would-be "Part 5" — merged back into Part 4 per instruction, so there is no separate Part 5 file). That session's scope: two real scoring bugs (Hyperstar's own cell, incidental-cell Affinity/Frenzy), a Frenzy-not-showing-in-panel bug, boosted/penalized stat coloring, the Discharger's blast shape (3×3 → diamond), a Maniac/Addict `NaN`-poisoning bug (root cause of a separately-reported "Fanatic isn't applying" bug), a right-side History panel, richer history match text + dedicated level-up/boon colors, a new target-score formula, special-gem spawn position (swap-cell-aware), a full boon shop, and a UI sizing/readability pass + version tag. See Section 12 onward for all of it.

---

## 1. Summary of This Part (original scope)

| # | Feature | Status |
|---|---|---|
| 1 | Click-and-drag swapping (in addition to click-then-click) | Done |
| 2 | Stuck-board game-over dialog (blocks input, was previously a bug) | Done |
| 3 | Boon-card gem icon (next to the boon's title) | Done |
| 4 | Deferred level-up dialog (waits for the whole cascade to settle) | Done — includes a `busy` bugfix |
| 5 | Gem Stats panel gem icon (inline with the gem's name) | Done |
| 6 | Star Gem renamed to **Discharger**, with reworked/expanded behavior | Done (blast shape later changed again — see §15) |
| 7 | Hint feature (10s idle nudge, pulsing glow on a legal move) | Done |

*(Sections 2–11 below — Drag-to-Swap, Stuck-Board Dialog, Boon-Card Icon, Deferred Level-Up Dialog, Gem Stats Icon, Star→Discharger, Hint Feature, File Layout, Feature Status, Gotchas — are UNCHANGED from the original Part 4 and are omitted here for length. Nothing in this session touched those mechanisms except where explicitly noted below.**Refer to your existing Part 4 file's Sections 2–11 for that original content** — this replacement only adds Sections 12+.)

---

## 12. Scoring bugfixes: incidental cells now score correctly

Two related bugs, both affecting "an exploded/blast-chained gem doesn't score right":

**Bug A — Hyperstar's own cell was scored as the wrong gem.** `handleHyperstarSingle()` (main.js) used to fold the Hyperstar's own cell into the `targetGemType` matched-group's `length` — scoring it using the WIPED color's base value instead of whatever color the Hyperstar itself actually sat on. Fixed: the Hyperstar's own cell is now pulled out and scored separately as its own incidental cell, using its real underlying gem type (read from `grid[hyperRow][hyperCol]` before anything is nulled out).

**Bug B — Affinity/Frenzy never applied to incidental (blast-chained) cells**, only to formed matches — this was a flagged-but-unresolved TODO from Part 1. `score.js`'s `calculateCascadeStepScore()` now runs the same `affinityBonusFor()`/`frenzyAdjustmentFor()` lookups inside the incidental-cells loop that the matched-groups loop already had. A new export, `getMatchBonusForGem(gemId)` (`affinityBonusFor(gemId) + frenzyAdjustmentFor(gemId)`), centralizes this so the side panel (§13) reads the exact same number the scoring pipeline actually applies.

**Files touched:** `js/gameplay/main.js` (`handleHyperstarSingle`), `js/gameplay/score.js` (`calculateCascadeStepScore`, new `getMatchBonusForGem` export).

---

## 13. Bugfix — Frenzy invisible in the side stats panel; boosted/penalized coloring

`renderSideStats()` used to read `boonEffectState.affinityBonus[id]` directly for the "match" stat — Frenzy writes to a completely different bucket (`frenzyPicks`), so a Frenzy pick was structurally invisible there. Fixed by switching to `score.js`'s new `getMatchBonusForGem(id)` (§12), which combines both.

**Also added this session:** every stat in the side panel (base score, base multiplier, match bonus, and both global stats) is now colored relative to its OWN no-boon default — green (`.gem-stat-boosted`) if a boon has pushed it up, red (`.gem-stat-penalized`) if pulled down, left alone otherwise. New helper `statDiffClass(value, defaultValue)` in `main.js`, applied via `className` (fully overwritten each render, not toggled) so no stale color class can linger from a previous boon pick.

**Files touched:** `js/gameplay/main.js` (`renderSideStats()` rewritten, new `statDiffClass()`), `css/design/layout.css` (`.gem-stat-boosted`/`.gem-stat-penalized` + combined-specificity selectors).

---

## 14. Bugfix — Maniac/Addict `NaN`-poisoning (root cause of a "Fanatic broken" report)

**Root cause, not a Fanatic bug at all:** at one point the Maniac archetype's `effect` object had no `othersPenalty` field, but its dispatch case in `boon_effects.js` read `effect.othersPenalty` unconditionally (`anyNumber += undefined === NaN`). Picking Maniac once permanently set every OTHER gem's `multiplierBonus` to `NaN` for the rest of that run (stored state, mutated with `+=`, never self-heals). Any later multiplier boon on a poisoned gem — including Fanatic — then also came out `NaN` (`NaN + 15 === NaN`), which is what actually made Fanatic look broken.

**Current state (verified against the user's own reuploaded/refactored file):** Addict now uses `effect.kind: 'gem_multiplier_addict'` (with `amount` + `othersPenalty`, both read and applied), and Maniac now uses `effect.kind: 'gem_multiplier_delta'` (a plain `+= amount`, which never reads `othersPenalty` at all). This is safe — there's no code path left that can read an undefined `othersPenalty` and NaN-poison state. **No further code change was needed**, only verification.

**⚠️ Known residual risk, not fixable in code:** any save/run that picked the broken Maniac before this was fixed still has real `NaN` baked into `gemBaseState` for the affected gems. Only "start over" (`resetGemBaseState()`) clears it — it does not self-heal mid-run.

---

## 15. Discharger blast shape: 3×3 → diamond

`dischargerBlastCells(row, col)` (`js/gameplay/special_gem.js`) no longer clears a flat 3×3 square on a normal match/chain-reaction hit. It now clears a diamond: every cell within Manhattan distance 2 (`|dRow| + |dCol| <= 2`), i.e.

```
    X
  X X X
X X X X X
  X X X
    X
```

Implementation walks the 5×5 bounding box and drops anything outside the Manhattan-2 radius — a one-number tweak (`> 2`) if the radius ever needs to change. `SPECIAL_GEM_INFO[DISCHARGER].description` (`js/resources/special gem/special_gem.js`) updated to match. This is the PASSIVE on-match effect only — the three swap-activated Discharger combos (Laser, Double-Discharger, Hyperstar) are unchanged (Double-Discharger still uses the old row+column+diagonals `radialBurstCells()`, per Part 4's original design).

---

## 16. Right-side History panel

New panel, mirroring the left-side `#side-stats` panel structurally (fixed position, independent of the centered flex layout).

- **New files:** `js/resources/history/history_state.js` (mutable `{ entries: [] }`, entries are `{ kind: 'score'|'boon', text, tone }`), `js/gameplay/history.js` (`addHistoryEntry(kind, text, tone)`, `resetHistory()`, hard-capped at 200 entries, trimmed from the oldest end).
- `main.js`'s `renderHistoryPanel()` rebuilds the list from scratch on every entry (same "just rebuild it" convention as `renderSideStats()`), newest entry at the TOP (display-only reversal — `historyState.entries` itself stays oldest-first).
- Wired into `applyScoreGain()` (every score gain + every level-up gets a line) and `showBoonDialog()`'s card handler (every free boon pick gets a line) — plus `buyBoonFromShop()` (§19) for shop purchases.
- `index.html`: new `#history-panel`/`#history-list` markup. `css/design/layout.css`: new HISTORY PANEL block (same small-screen static-position fallback as `.side-stats`).

### 16a. Match text format (this session, later in the same conversation)

Score history lines were originally just a bare `+80`/`combo x2! +140`. Reworked into a dedicated builder, `buildMatchMessage(matchedGroups, incidentalCells, comboCount, gained)` (`main.js`):

- Single formed match: `"Match 3 Amethyst: +80"`
- Multiple simultaneous formed matches in one step: `"Match 3 Amethyst + Match 4 Ruby: +215"`
- A chain-reaction (existing special gem incidentally blasting) riding along: `"...+ Chain Reaction (5 gems): +215"`
- A cascade combo step (2nd+ link): `"Combo x2: Match 3 Ruby: +140"`

All 7 swap-activated combo functions (`handleHyperstarSingle`, `handleHyperstarLaserCombo`, `handleHyperstarDischargerCombo`, `handleHyperstarDouble`, `handleLaserCombo`, `handleDischargerLaserCombo`, `handleDischargerDouble`) were reformatted to the same `"<Combo Name>: <score>"` convention — e.g. `"Hyperstar Wipe: +32"`, `"Discharger Laser Combo: +140"` — replacing the old lowercase-with-exclamation-point strings (`"hyperstar! +32"` etc). These are intentionally a SEPARATE code path from `buildMatchMessage()` — they clear mixed colors across the board, so there's no single `matchedGroups` list to describe the same way.

### 16b. Dedicated colors: level-up ('levelup') and boon ('boon') tones

Two new `tone` values, beyond the original `'positive'/'negative'/'neutral'`:

- **`'levelup'`** (gold, bold) — the level-cleared history line. Text also simplified: `"Level 1 cleared! Moving to Level 2."` (was `"Cleared level 1! Now on level 2."`). Multi-level jumps still supported: `"Level 1-2 cleared! Moving to Level 3."`
- **`'boon'`** (violet, `#b892f0`) — EVERY boon-pick line, free or bought, regardless of `BOON_TYPE` (buff/curse/risky). This REPLACED the old logic that derived green/red/neutral off `def.type` — that made a boon pick visually indistinguishable from a plain score line at a glance. The boon's own description text already conveys buff-vs-curse; the color now just marks "this is a boon pick." `BOON_TYPE` import was removed from `main.js` since nothing there reads it anymore.

**Files touched:** `js/gameplay/main.js` (`buildMatchMessage()` new, `applyScoreGain()`'s level-up branch, `showBoonDialog()`'s tone line, all 7 combo handler popup strings), `js/gameplay/history.js` (JSDoc only), `css/design/layout.css` (`.history-entry--levelup`, `.history-entry--boon`).

---

## 17. Target score formula (changed again this session)

`js/gameplay/progression.js`'s `calculateScoreTarget(level)`:

```
target(level) = ROUND(1000 x 1.15^(level-1)) x level + 500 x 1.05^level
```

- Replaces the Part 3 formula (`ROUND(2000 x 1.25^(level-1)) x level + 500 x 1.5^level`).
- The old special-cased `if (level <= 1) return 2000;` early-return is GONE — the new formula is well-defined at level 1 on its own (comes out to 1525), so hardcoding level 1 would now make it silently disagree with the curve. **Don't reintroduce that branch.**
- Same rounding convention as every prior version: only the first term is rounded before its `x level` multiply; the whole expression is rounded once at the end, after `boonEffectState.targetScoreMultiplier` is applied.
- Still a pure function of `level` alone.

---

## 18. Special-gem spawn position now follows the swap

Previously, every spawned special gem (Laser/Hyperstar/Discharger) always appeared at the matched group's geometric middle (straight run) or L/T intersection (`middleCell()`/`intersectionCell()`), regardless of what the player actually did.

**New behavior:** on the FIRST cascade step immediately following a real player swap, if either of the two swapped cells (`from`/`to`) ended up inside the matched group, the spawn appears there instead — preferring the destination (`to`) cell if BOTH swapped cells happen to land in the same group. Every cascade link AFTER the first (gravity-caused, no associated swap) still falls back to the original middle/intersection rule, since there's no swap to reference.

**Mechanism:**
- `special_gem.js`'s `classifyGroup(group, swapCells)` gained a `swapCells` parameter (`[[fromRow,fromCol],[toRow,toCol]] | null`), and a new `pickSpawnCell(cells, swapCells, fallbackFn)` helper that does the "prefer a swapped cell, else fall back" logic.
- `resolveSpecialGems(grid, matched, swapCells = null)` (same file) threads `swapCells` through to `classifyGroup()`.
- `main.js`'s `resolveMatches(swapCells = null)` gained the same parameter. Only ONE call site ever passes a non-null value: `attemptSwap()`'s normal-match fallback branch (case 8), which now calls `resolveMatches([[r1, c1], [r2, c2]])`. Every recursive continuation goes through `setTimeout(resolveMatches, CASCADE_CHECK_DELAY_MS)` with NO arguments — so it naturally defaults back to `null` for every deeper cascade link, with zero extra bookkeeping needed.

**Files touched:** `js/gameplay/special_gem.js` (`pickSpawnCell` new, `classifyGroup`/`resolveSpecialGems` signatures), `js/gameplay/main.js` (`resolveMatches` signature, `attemptSwap`'s case-8 call site).

---

## 19. Boon Shop (new system)

A NEW, separate shop that sells extra boon picks for score — distinct from the OLD, still-fully-dormant artifact/relic/fossil shop (`resources/shop/shop.js`/`shop_state.js`/`gameplay/shop.js`, from Part 1, still untouched and still not wired to anything). The only thing reused from that old module is `SHOP_LEVEL_INTERVAL` (5) and `shouldOpenShop(level)` — the "every 5 levels" cadence check, which is generic enough to share.

### Trigger & flow

Opens after EVERY free level-up boon pick, IF the level just cleared (`progressionState.level - 1` — progression has already advanced by the time the boon dialog runs) is a multiple of `SHOP_LEVEL_INTERVAL`. New `main.js` function `proceedAfterBoonPick(def, onContinue)` is now what `showBoonDialog()`'s card handler calls at its tail (replacing the old inline `isBoardShapeBoon ? startTilePlacement(...) : onContinue()` check) — it opens the shop first if due, and only runs the board-shape-placement/`onContinue()` step after the shop is closed.

### Offer & pricing

- 5 boons per visit (`BOON_SHOP_OFFER_COUNT`), equal-weighted (NOT rarity-weighted like the free dialog) — new `generateEqualWeightBoonOffer(count, extraFilter)` in `js/gameplay/boon.js`, kept as its OWN function (not a flag on `generateBoonOffer()`) specifically so the shop's selection strategy can change independently later.
- Shares `maxOccurrences`/gem-unlock gating with the free dialog (same `isBoonAvailable()` filter) — a boon bought from the shop counts toward the exact same per-gem cap a free pick would, per design decision.
- **Board-shape boons (`board_expand`/`board_shrink`/`board_expand_and_shrink`) are excluded from the shop offer entirely** — they need an immediate placement click right after picking, which doesn't fit "buy several boons in one visit, then leave whenever." Flagged as a deliberate scope cut, not an oversight — would need a placement-queueing redesign to support.
- Price formula (`js/gameplay/boon_shop.js`'s `calculateBoonPrice(rarity, tier)`):
  ```
  price = ROUND(BASE_BOON_PRICE x rarityMultiplier x inflation x BASE_PRICE_MULTIPLIER)
  inflation = (1 + INFLATION_RATE_PER_TIER) ^ (tier - 1)
  ```
  `BASE_BOON_PRICE = 500`, `BASE_PRICE_MULTIPLIER = 1.0` (currently a no-op tuning knob), `INFLATION_RATE_PER_TIER = 0.15`. Tier 1 (level 5, the first shop) pays NO inflation (`tier - 1 = 0`); tier 2 (level 10) is the first one inflated (x1.15). Rarity multiplier table: Common 1x / Uncommon 1.25x / Rare 1.75x / Epic 2.5x / Legendary 3.25x.

### Purchase behavior

- Player can buy as many of the 5 as they can afford, in any order, in one visit.
- A bought card greys out immediately (`.shop-card--bought`) and can't be bought again this visit; an unaffordable card is separately dimmed (`.shop-card--unaffordable`) but re-enables live as score changes from other purchases.
- Explicit "Leave" button closes the shop without requiring a purchase.
- `buyBoonFromShop(def, price)` deducts score, then calls the SAME `pickBoon()`/`applyBoonEffect()` pair the free dialog uses (so maxOccurrences tracking is identical regardless of free-vs-bought), logs a `'boon'`-toned History line (`"Bought from shop: <name> (-<price>) — <description>"`), and re-renders both the side stats panel and the shop dialog itself (so the score display and every other card's afford-check update live).

### New files

- `js/resources/shop/boon_shop.js` — fixed pricing data (`BASE_BOON_PRICE`, `BASE_PRICE_MULTIPLIER`, `INFLATION_RATE_PER_TIER`, `BOON_SHOP_RARITY_MULTIPLIER`, `BOON_SHOP_OFFER_COUNT`). Imports `BOON_RARITY` from `resources/boon/boon.js` (resource-to-resource import, same documented Rule 6 exception as Part 1's `ALL_GEM_CATALOG` reuse).
- `js/resources/shop/boon_shop_state.js` — mutable `{ offer: [], purchasedIds: [] }`, scoped to one visit, not the whole run.
- `js/gameplay/boon_shop.js` — `calculateBoonPrice()`, `shopTierForLevel()`, `rollBoonShopOffer()`, `isBoonPurchasedThisVisit()`, `markBoonPurchased()`, `resetBoonShop()`.

### Touched files

`js/gameplay/boon.js` (+`generateEqualWeightBoonOffer`), `js/gameplay/main.js` (new imports/DOM refs/state `shopContinuation`/`currentShopTier`, +`proceedAfterBoonPick()`/`openShopDialog()`/`renderShopDialog()`/`buyBoonFromShop()`, `showBoonDialog()`'s tail rewritten, `init()` gains `resetBoonShop()` + shop-dialog hide, `applyStaticText()` gains shop title/button, new `shopLeaveBtn` listener), `js/resources/constant/text.js` (`DIALOG_TITLES.SHOP`, `BUTTONS.LEAVE_SHOP`), `index.html` (`#shop-dialog` markup), `css/design/dialog.css` (SHOP DIALOG block: `.shop-dialog-box`, `.shop-choices`, `.shop-card` + `--bought`/`--unaffordable` variants, `.shop-card-price`).

---

## 20. UI sizing & readability pass

Purely visual, no gameplay logic touched.

- **Text:** `html { font-size: 18px; }` added to `css/design/typography.css` (default browser root is 16px). Since nearly every font-size in this project is `rem`-based, this one line scales essentially the entire UI's text proportionally (~+1-2px on smaller text, more on headings) instead of hand-editing dozens of individual rules.
- **Board + gems, 1.5x:** `.cell` (and the JS-driven `boardEl.style.gridTemplateColumns/Rows` in `render.js`, which wins at runtime) went from 46px to 69px; board `gap` 4px→6px, `padding` 10px→15px. Gems themselves need no separate change — `.gem` is already sized as `78%` of `.cell`, so it scales automatically. Special-gem overlay decorations (laser arrows, pulsing glow rings, Hyperstar glow) were scaled by the same 1.5x in `gems.css` to stay proportional. Two small UI gem icons (`.gem-stat-icon`, `.boon-card-gem-icon` — the latter also used by shop cards) bumped 14px→16px and 22px→25px respectively for consistency.
- **Version tag:** new `GAME_VERSION` export in `text.js` (currently `"0.5.0"`), rendered into a new fixed-position `#version-tag` element (bottom-right corner, dim/low-opacity, sits below modal dialogs) by `main.js`'s `applyStaticText()`.

**Files touched:** `css/design/typography.css`, `css/design/layout.css` (`#board`/`.cell`, new `.version-tag` block), `js/gameplay/render.js` (hardcoded 46→69, two lines), `css/model/gems.css` (overlay scaling), `css/design/dialog.css` (`.boon-card-gem-icon`), `js/resources/constant/text.js` (`GAME_VERSION`), `index.html` (`#version-tag` markup), `js/gameplay/main.js` (`versionTagEl` ref + `applyStaticText()` line).

---

## 21. Consolidated Gotchas (new this session — additive to Part 1's list)

### `NaN` doesn't self-heal
If a run ever picks a boon whose `effect` object is missing a field its dispatch case in `boon_effects.js` unconditionally reads (see §14), the affected `gemBaseState` entry becomes `NaN` and STAYS `NaN` for the rest of that run — every later boon applied to that gem is `NaN` too. Only `resetGemBaseState()` (called by `resetBoonEffects()` in `init()`) clears it. When adding a NEW `effect.kind` case to `boon_effects.js`, guard any optional numeric field with `|| 0` rather than reading it raw.

### `resolveMatches(swapCells)` — the parameter is intentionally almost-always-null
Only `attemptSwap()`'s case-8 fallback passes swap cells through, and only for that ONE call. If you add a new code path that also needs to trigger match resolution after a real swap (not a cascade), remember to pass `[[r1,c1],[r2,c2]]` explicitly — the default is `null`, which silently falls back to old middle/intersection spawn placement instead of erroring.

### The shop and the free boon dialog SHARE `maxOccurrences` state on purpose
Both go through the same `boonState.activeBoons` / `pickBoon()` — this is deliberate (§19), not a bug. Don't give the shop its own separate pick-tracking list, or a boon could be taken past its cap by buying it from the shop after already hitting the cap via free picks (or vice versa).

### Shop offer deliberately excludes board-shape boons
See §19 — if board-shape boons need to become purchasable later, that requires a placement-queueing redesign (buy-then-place, possibly queued across multiple purchases in one visit), not just removing the filter.

### `html { font-size: 18px; }` affects EVERYTHING rem-based, project-wide
This is intentional (§20) but worth knowing before adding new UI: any new element sized in `rem` automatically inherits this scale-up. Anything sized in flat `px` (like the board's 69px cells, or the special-gem overlay's hand-scaled decorations) does NOT — those had to be manually updated to 1.5x separately and will need the same manual treatment for any future px-based sizing.

### `render.js`'s hardcoded cell size must match `layout.css`'s `.cell` size
Both are the SAME number (currently 69px) maintained in two places — the CSS is a same-paint fallback before JS runs, but `render.js`'s inline `style.gridTemplateColumns/Rows` is what actually wins once the board renders. Changing one without the other will make the grid template and the cell boxes disagree.

---

## 22. Shop pricing formula changed (user-authored revision)

§19's original price formula (`BASE x rarity x inflation x baseMult`, purely multiplicative) was replaced with a new one that adds a second, score-scaled term:

```
Shop item price = Base Price x Inflation Scaling x Base Multiplier
                   + Rarity% x (score when entering the shop)
```

`BOON_SHOP_RARITY_MULTIPLIER` (`js/resources/shop/boon_shop.js`) now holds PERCENTAGES rather than flat multipliers, and is used TWICE in the formula — once as before (scaling the flat base-price term) and once as a fraction of the player's score (the new additive term):

```js
export const BOON_SHOP_RARITY_MULTIPLIER = {
  [BOON_RARITY.COMMON]: 0.10,
  [BOON_RARITY.UNCOMMON]: 0.15,
  [BOON_RARITY.RARE]: 0.30,
  [BOON_RARITY.EPIC]: 0.45,
  [BOON_RARITY.LEGENDARY]: 0.70,
};
```

`calculateBoonPrice()` (`js/gameplay/boon_shop.js`) gained a third parameter, `score`:

```js
export function calculateBoonPrice(rarity, tier, score) {
  const rarityMultiplier = BOON_SHOP_RARITY_MULTIPLIER[rarity] ?? 1.0;
  const inflation = Math.pow(1 + INFLATION_RATE_PER_TIER, tier - 1);
  return Math.round(BASE_BOON_PRICE * rarityMultiplier * inflation * BASE_PRICE_MULTIPLIER)
       + Math.round(score * rarityMultiplier);
}
```

`renderShopDialog()` (`main.js`) now passes the live `score` variable through: `calculateBoonPrice(def.rarity, currentShopTier, score)`.

### ⚠️ Flagged, not changed: "score" is read LIVE, not snapshotted at shop-open

The design phrase "rarity% of the score **when you enter the shop**" reads as a one-time snapshot taken at the moment `openShopDialog()` runs. As implemented, `renderShopDialog()` re-reads the live, current `score` variable on every render — which includes every re-render `buyBoonFromShop()` triggers after each purchase. Net effect: buying one boon lowers `score`, which immediately lowers the RARITY-based cost of every other card still on the shelf (since it's `rarity% x current-score`, not `rarity% x score-at-open`), rather than every card being priced once against a fixed opening balance.

This may be exactly the intended behavior (a "price responds to your current wealth in real time" shop) — flagging only because it's a plausible reading of "when you enter the shop" that the current code doesn't literally implement. If a true snapshot IS wanted: capture `const shopEntryScore = score;` once inside `openShopDialog()` (alongside `currentShopTier`), store it in the same module-level state, and have `renderShopDialog()` pass that snapshot instead of the live `score` variable. Not changed in code — left as a design call.

### Boon pool: Construction/Deconstruction boons removed (for now)

The four board-shape boon pool entries (`quarry_extension`, `open_pit_expansion`, `condemned_shaft`, `collapsing_vein` — `effect.kind` one of `board_expand`/`board_shrink`/`board_expand_and_shrink`) have been removed from `BOON_POOL` (`resources/boon/boon.js`) "for the time being." Practical effects, all of them now DORMANT rather than deleted outright in the surrounding code:

- The free level-up boon dialog can never offer one — `generateBoonOffer()` simply has none in its pool to draw from.
- `main.js`'s `isBoardShapeBoon` check inside `proceedAfterBoonPick()` (and the whole `startTilePlacement()`/`advanceTilePlacement()`/`handlePlacementClick()` flow it guards) is now unreachable in normal play — left in place, not deleted, since it's still fully correct code waiting for the boons to come back.
- `boon_shop.js`'s `rollBoonShopOffer()` still filters `PLACEMENT_ONLY_KINDS` out of the shop offer (§19) — now redundant (there's nothing of that kind left in `BOON_POOL` to filter), but harmless to leave in place for when the pool entries return.
- `tiles.js`'s `expandBoard()`/`shrinkBoard()`/`getExpandableCells()`/`rebuildGridRespectingBlocked()` and the ghost-cell rendering in `render.js` are all still fully intact and correct — only the ENTRY POINT (a pickable boon) is gone. Re-adding the four pool entries to `boon.js` is a complete, self-contained way to bring the whole feature back with no other code changes needed.

**If re-adding these boons later:** just restore the four `constructionDeconstructionBoons` entries to `BOON_POOL`'s spread in `resources/boon/boon.js` — everything downstream (dialog, shop filter, placement flow) is still wired and waiting.

---

## 23. Rarity odds rebalanced; Legendary gated behind level 6 (everywhere)

`BOON_RARITY_WEIGHTS` (`js/resources/boon/boon.js`) changed from Common 50% / Uncommon ~10-20% (see Part 3's changelog for the exact prior split) / Rare / Epic / Legendary 2% to:

```js
export const BOON_RARITY_WEIGHTS = {
  [BOON_RARITY.COMMON]: 0.50,
  [BOON_RARITY.UNCOMMON]: 0.25,
  [BOON_RARITY.RARE]: 0.15,
  [BOON_RARITY.EPIC]: 0.08,
  [BOON_RARITY.LEGENDARY]: 0.02,
};
```

Comment on this table now explicitly notes it's the Luck-stat BASELINE — a future Luck stat is meant to shift these weights toward rarer tiers, not replace the table or the rolling mechanism (`rollRarity()` in `gameplay/boon.js`, unchanged).

**Note — this table only governs the free level-up dialog's WEIGHTED roll.** The shop's `generateEqualWeightBoonOffer()` doesn't consult rarity weights at all (equal chance per available boon, by design — see §19). Keeping Legendary out of the shop needed a separate mechanism — see below.

### Legendary level gate

New constant, `LEGENDARY_UNLOCK_LEVEL = 6` (`js/resources/constant/constants.js`). Enforced in exactly ONE place: `gameplay/boon.js`'s `isBoonAvailable(def)`:

```js
if (def.rarity === BOON_RARITY.LEGENDARY && progressionState.level < LEGENDARY_UNLOCK_LEVEL) return false;
```

This works for BOTH offer generators — the free dialog's `generateBoonOffer()` and the shop's `generateEqualWeightBoonOffer()` — because both already filter their candidate pool through `isBoonAvailable()` before rolling/shuffling. No shop-specific or dialog-specific gate was needed; gating it at the shared availability check was enough to cover every current AND future boon-offering surface for free.

`generateBoonOffer()`'s existing "reroll on an empty tier" fallback (`if (candidates.length === 0) continue;`) already handles a Legendary roll coming up empty pre-level-6 — it just silently rerolls into another tier, so a player never sees a short offer before Legendary unlocks.

### Gotcha: any FUTURE rarity-gate (or similar level-gated restriction) belongs in `isBoonAvailable()`, not scattered per-caller

If another rarity (or any other boon-level restriction) ever needs the same "not available until X" treatment, add it as another early-return in `isBoonAvailable()` — do NOT add a parallel check inside `generateBoonOffer()`/`generateEqualWeightBoonOffer()`/`boon_shop.js` individually. The whole point of routing both offer generators through one shared gate function is that a restriction defined once is enforced everywhere automatically; duplicating the check per-caller risks the two surfaces drifting out of sync (e.g. the shop offering something the free dialog still correctly withholds, or vice versa).

---

## 24. Bugfix — Hyperstar was being incidentally swept into plain color matches

**Reported symptom:** a Hyperstar spawned from Ruby, sitting on the board, would get silently consumed as "just a Ruby" whenever the player's swap formed an adjacent 3-in-a-row of Ruby that happened to include the Hyperstar's cell — scored/cleared as a normal match-3, its special ability never triggering.

**Root cause:** `board.js`'s `findMatches()` scans the raw numeric `grid` only — it has no way to know a cell currently holds a special gem, so a Hyperstar's cell (which still carries its underlying color in `grid[][]`, only its VISUAL/behavior is overridden via `specialGemState`) was just as matchable as any plain gem of that color.

**Scope of the fix — Hyperstar ONLY, not Laser/Discharger:** Laser and Discharger are DESIGNED to be swept into a normal match or a chain-reaction blast — that's literally how their passive on-match effect triggers (see Part 4 §7/§15). Hyperstar is explicitly swap-activated only (`resolveSpecialGems()`'s dispatch comment: "Hyperstar deliberately has no case — it's swap-activated only... and never blasts as part of a normal chain reaction") — but nothing previously enforced that at the match-DETECTION level, only at the trigger-dispatch level. This fix closes that gap for Hyperstar specifically; Laser/Discharger's existing "sweepable into a match" behavior is untouched and still correct.

### Mechanism

- `board.js`'s `findMatches(g, isExcluded)` gained an optional exclusion predicate — same convention as `createGridNoMatches()`'s pre-existing `isBlocked` parameter, keeping `board.js` fully unaware of WHAT "excluded" means (Rule 2/Rule 9 preserved; it's just told "skip this cell," not "this cell holds a special gem"). A cell (or run-anchor) that's excluded can never extend a run NOR anchor one — checked every iteration of the run-scan loop, so an excluded cell always forces an immediate 1-length break regardless of what's adjacent to it in either direction.
- `hasPossibleMove(g, isExcluded)` and `findHintMove(g, isExcluded)` both gained the same parameter, forwarded straight to their internal `findMatches()` calls on each hypothetical scratch-clone swap — needed so the deadlock/hint checks agree with what a real swap would actually do, instead of hinting/allowing a "move" that would revert as invalid once actually attempted.
- `main.js`'s new `isHyperstarCell(row, col)` builds the actual predicate from `specialGemState`/`SPECIAL_GEM_TYPE`, passed at all 4 real call sites: `attemptSwap()`'s case-8 fallback, `resolveMatches()`, `checkEndState()`'s `hasPossibleMove()` call, and `showHintNow()`'s `findHintMove()` call.

### Known simplification (flagged, not fixed)

`hasPossibleMove()`/`findHintMove()`'s scratch-clone swap tests only clone the plain `grid`, never `specialGemState.grid` — so `isHyperstarCell()` is evaluated against a Hyperstar's CURRENT real-board position, not where it would hypothetically end up after the swap being tested. Same category of approximation as Part 1's pre-existing "hasPossibleMove() doesn't account for Hypercube activation" TODO — not expected to cause visible issues in practice (a Hyperstar rarely sits exactly on one of the two cells being hypothetically swapped), but noted for completeness.

### Explicitly NOT addressed — flagged for a future decision

If a Laser or Discharger's blast happens to pass through a cell holding a Hyperstar during the existing chain-reaction BFS in `resolveSpecialGems()`, that Hyperstar cell still gets swept up and cleared as an ordinary incidental cell — this fix only touches `findMatches()`'s plain color-run detection, not the separate blast-expansion code path. Whether a detonation should also spare a Hyperstar in its path is a different design question than the one reported this round (a plain color match absorbing it) — left as-is pending a decision.

**Files touched:** `js/gameplay/board.js` (`findMatches`, `hasPossibleMove`, `findHintMove`), `js/gameplay/main.js` (new `isHyperstarCell()`, 4 call-site updates).