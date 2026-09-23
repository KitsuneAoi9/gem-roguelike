# Handoff — Part 3: Bugfixes, Stats Panel, Special-Gem Rework, Scoring Tuning

This is a continuation of `handoff-part-2.md`. Scope: a bundle of bugfixes
found during playtesting, a new left-side stats panel, a full rework of
the special-gem system (directional Laser Beams + a Hyperspace Star with
three swap combos), a relocated score popup, and several rounds of tuning
on the Opulence boon and the target-score formula (ending on a final formula
below — earlier formulas tried this session are listed in the changelog
for context, not left active in code).

---

## 1. Bugfix — boon dialog rendered empty

`main.js`'s `showBoonDialog()` built each `.boon-card` element and wired
up its click handler, but never called `boonChoicesEl.appendChild(card)`
— so the dialog opened correctly (title visible, not skipped) but
`#boon-choices` stayed empty since the cards were never inserted into the
DOM. Fixed by appending each card at the end of the `offer.forEach(...)`
loop.

---

## 2. Bugfix — moves-limit flag didn't hide/freeze the moves stat

`ENABLE_MOVES_LIMIT = false` disabled the loss check in `checkEndState()`,
but the "MOVES LEFT" stat block was still visible and `moves` still
incremented/decremented on every swap and level-up. Fixed:

- `index.html`'s moves `.stat` block now has `id="moves-stat"`.
- `main.js` hides that block once on load via a new
  `applyMovesLimitVisibility()`, gated on `ENABLE_MOVES_LIMIT`.
- Every `moves++`/`moves--` site (`attemptSwap()`'s two branches,
  `applyScoreGain()`'s level-up bonus) is now itself gated on
  `ENABLE_MOVES_LIMIT`, so the variable is frozen at its initial value
  for the whole run when the flag is off — not just hidden from view.

---

## 3. Score popup relocated above the board

Score-change text (combo messages, hyperstar/laser messages) no longer
writes to `#message` below the board. It now floats above the board via
a new `#score-popup` element (`index.html` / `layout.css`), shown/hidden
by `main.js`'s new `showScorePopup()`, with an explicit `SCORE_POPUP_MS`
(1800ms, `constants.js`) lifetime — about 1s longer than the old
implicit display window. `messageEl` is now reserved for status text
only (select prompt, invalid swap, reshuffling, placement instructions).
`applyScoreGain()`'s second parameter was renamed `comboMessage` ->
`popupText` to reflect this.

### Bugfix found in passing
`attemptSwap()`'s swap-activation branch was calling an undefined
`calculateMatchScore(...)` with an undefined `BASE_GEM_SCORE` — both
leftover from before the scoring-pipeline rewrite, neither ever
imported. Any Hypercube/Hyperstar swap would have thrown at runtime.
Replaced with `calculateCascadeStepScore(...)`, matching the pipeline in
Section 8 of `handoff-part-1.md`.

---

## 4. Special gems reworked: Laser Beams + Hyperspace Star

`SPECIAL_GEM_TYPE.FLAME` is **gone**, replaced by `LASER_ROW`/`LASER_COL`
— a straight match-4 now spawns a directional laser (row if the match ran
horizontally, column if vertical) instead of the old both-directions
Flame. `HYPERCUBE` was **renamed** to `HYPERSTAR` throughout
(`special_gem.js` x2, `main.js`, `render.js`, `gems.css`) — naming only
for the match-5-straight-line case, no trigger-condition change.

### New swap-activated behavior
Handled in `main.js`'s `attemptSwap()`, new trigger functions live in
gameplay `special_gem.js`:

| Swap combo | Effect |
|---|---|
| Hyperstar + normal/Star gem | Same-color board wipe (unchanged from old Hypercube) — `triggerHyperstarSingle()` |
| Hyperstar + Laser | Every gem of the laser's color converts to a laser (random orientation each) and all detonate at once — `triggerHyperstarLaserCombo()` |
| Hyperstar + Hyperstar | Clears the entire board — `triggerHyperstarDouble()` |
| Laser + Laser (any orientations) | Clears the full row AND column through the swap's **destination** cell — `triggerLaserCombo()` |

The three new mixed-color combos (Hyperstar+Laser, Hyperstar+Hyperstar,
Laser+Laser) score their cleared cells as `incidentalCells` (flat
per-cell value) rather than one big same-color `matchedGroup`, since
their cleared cells span mixed colors. The original Hyperstar+normal
case keeps the old single-group scoring, since all its cleared cells
share one color.

### Visuals
- Laser gems get directional CSS-triangle arrows (left/right for row,
  up/down for column) instead of the shared pulsing glow — see
  `gems.css`'s `LASER BEAM GEMS` section (`.gem--laser-row`,
  `.gem--laser-col`).
- Hyperstar gets an actual yellow star shape (`clip-path:
  polygon(...)`) replacing its underlying gem's SVG entirely, plus a
  yellow-tinted version of the shared pulsing glow (`.gem--hyperstar`).
- `render.js` converts `specialType`'s snake_case (`laser_row` etc.) to
  kebab-case for the CSS class name (`gem--laser-row`).

### Known simplification (not yet addressed)
The Hyperstar+Laser combo's board-wide "convert to laser" step and its
detonation happen in the same synchronous pass — the player never sees
an intermediate frame where the board is full of un-detonated laser
gems before they all fire. Flagging in case a deliberate render-then-
wait beat is wanted here later.

---

## 5. New: left-side stats panel

`#side-stats` (`index.html`, fixed-position via `layout.css`) shows, per
active gem: current base score, base multiplier, and Affinity ("matching
bonus") total — plus the two global boon totals
(`globalScoreMultiplier`/`globalScoreBonus`). Driven by `main.js`'s new
`renderSideStats()`, called from `init()` and again right after
`applyBoonEffect()` in `showBoonDialog()`'s card handler — those are the
only two points where any of these numbers can change. Locked/future
gems are intentionally excluded from this panel. Collapses to static
(non-fixed) positioning under 900px viewport width so it doesn't overlap
the board.

---

## 6. Bugfix — board-shape boon placement clicks did nothing

`busy` was set `true` at the start of every swap and only ever cleared
once a cascade found no more matches. A board-shape boon (Quarry
Extension etc.) detours around that resolution path — it pauses at the
level-up dialog, then the boon dialog, then placement mode — so `busy`
stayed `true` the whole way through, and `onCellClick()`'s
`if (busy) return;` silently swallowed every placement click. Ghost
cells rendered correctly; clicking one did nothing.

Fixed in `advanceTilePlacement()`: `busy = false` when entering each
placement phase (so clicks are actually processed), `busy = true` again
once every phase is placed and control returns to the resumed cascade
(so the resumed cascade still blocks input exactly like it always has).

---

## 7. Bugfix — `BOON_RARITY.UNCOMMON` was undefined

`quarry_extension`/`open_pit_expansion` used `BOON_RARITY.UNCOMMON`,
which didn't exist in `resources/boon/boon.js`'s `BOON_RARITY` enum —
their `rarity` was `undefined` and could only surface via
`generateBoonOffer()`'s uniform top-up fallback, never the normal
weighted roll. Added `UNCOMMON` to the enum and re-split
`BOON_RARITY_WEIGHTS`: common .50 / uncommon .10 / rare .28 / epic .10 /
legendary .02.

---

## 8. Opulence boon tuned down

`othersPenalty` on the Opulence archetype (`resources/boon/boon.js`) reduced
from **-10 to -5** (description text updated to match) — -10 played too
strong. `effect.amount` (+150 to the chosen gem) is unchanged.

---

## 9. Target score formula — final version

The formula went through three iterations this session (see Changelog
below for the ones that were superseded). **Current, active formula** in
`gameplay/progression.js`'s `calculateScoreTarget(level)`:

```
target(level) = ROUND(2000 x 1.25^(level-1)) x level + 500 x 1.5^level
```

- This is a **direct, standalone** formula per level — **not**
  cumulative, does **not** depend on `target(level-1)`. No loop needed;
  it's a single calculation.
- Only the first term (`2000 x 1.25^(level-1)`) is rounded before its
  `x level` multiply, matching the formula as given. The second term
  (`500 x 1.5^level`) is not separately rounded; the combined total is
  rounded once at the very end.
- Still a **pure function of `level` alone** — `resetProgression()`/
  `advanceLevel()` can jump to any level and get the right answer with
  no dependency on having calculated any other level first.
- The global `targetScoreMultiplier` (Gemstone Gamble / Trinket Wager /
  Gem Greed / Jewel Avarice) is applied to the **whole result**, at the
  very end — consistent with every version of this formula tried this
  session.

```js
export function calculateScoreTarget(level) {
  const scaledTerm = Math.round(2000 * Math.pow(1.25, level - 1)) * level;
  const flatGrowthTerm = 500 * Math.pow(1.5, level);
  const raw = scaledTerm + flatGrowthTerm;
  return Math.round(raw * boonEffectState.targetScoreMultiplier);
}
```

### Changelog of formulas tried this session (superseded, for context only)

1. `ROUND(2000 x 1.25^(level-1))` — cumulative (`target(level) =
   target(level-1) + increment(level)`), implemented as a loop.
2. `ROUND(2000 x 1.25^(level-1)) x level` — still cumulative, increment
   now scaled by `level`, still a loop.
3. **(current)** `ROUND(2000 x 1.25^(level-1)) x level + 500 x
   1.5^level` — no longer cumulative, direct per-level formula, loop
   removed.

None of the earlier two remain in the codebase — only the final version
above is active.

---

## Files touched this session

- `main.js` — boon dialog append fix, moves-limit gating, score popup
  helper (`showScorePopup()`), `applyScoreGain()` rewrite, four new
  swap-combo handler functions, `attemptSwap()` rewrite, `busy` fix in
  `advanceTilePlacement()`, `renderSideStats()` + two call sites,
  `movesStatEl`/`applyMovesLimitVisibility()`.
- `index.html` — `#moves-stat` id, `#board-wrap`/`#score-popup`
  structure, `#side-stats` panel markup.
- `layout.css` — `.board-wrap`/`.score-popup` styles, `.side-stats` and
  related panel styles (with a small-screen fallback).
- `constants.js` — `SCORE_POPUP_MS`.
- `render.js` — special-gem class name snake_case -> kebab-case
  conversion.
- `special_gem.js` (resources) — `SPECIAL_GEM_TYPE`/`SPECIAL_GEM_INFO`
  reworked (`FLAME` -> `LASER_ROW`/`LASER_COL`, `HYPERCUBE` ->
  `HYPERSTAR`).
- `special_gem.js` (gameplay) — `classifyGroup()` now spawns directional
  lasers; new `triggerHyperstarSingle()` (renamed from
  `triggerHypercube()`), `triggerHyperstarLaserCombo()`,
  `triggerHyperstarDouble()`, `triggerLaserCombo()`.
- `gems.css` — laser arrow styles, hyperstar star-shape styles.
- `boon.js` (resources) — `BOON_RARITY.UNCOMMON` added, weights
  re-split, Opulence `othersPenalty`/description changed to -5.
- `progression.js` (gameplay) — `calculateScoreTarget()` rewritten
  (final version: direct formula, no loop).
