# Handoff — Part 4

Continues directly from Parts 1–3. Scope of this part: everything implemented in this session — drag-to-swap, the stuck-board game-over dialog, the deferred level-up dialog (+ a `busy` bugfix), boon-card and Gem-Stats gem icons, the Star→Discharger rework, and the hint feature. Architecture Rules 1–11 (Part 1) are unchanged and still govern all of this.

---

## 1. Summary of This Part

| # | Feature | Status |
|---|---|---|
| 1 | Click-and-drag swapping (in addition to click-then-click) | Done |
| 2 | Stuck-board game-over dialog (blocks input, was previously a bug) | Done |
| 3 | Boon-card gem icon (next to the boon's title) | Done |
| 4 | Deferred level-up dialog (waits for the whole cascade to settle) | Done — includes a `busy` bugfix |
| 5 | Gem Stats panel gem icon (inline with the gem's name) | Done |
| 6 | Star Gem renamed to **Discharger**, with reworked/expanded behavior | Done |
| 7 | Hint feature (10s idle nudge, pulsing glow on a legal move) | Done |

---

## 2. Drag-to-Swap

**What changed:** a gem cell now supports both the original click-then-click-adjacent flow AND press-and-drag toward a neighbor. Both live together in one Pointer Events–based handler per cell, so mouse/touch/pen all get the same behavior without separate code paths.

- `render.js`'s new `wireCellInteraction(cell, row, col, onCellClick, onCellSwap)` (internal, not exported) owns `pointerdown`/`pointermove`/`pointerup`/`pointercancel` for every non-BLOCKED cell. It uses `setPointerCapture()` so a fast drag doesn't "escape" the cell it started on. A press that never exceeds `DRAG_SWAP_THRESHOLD_PX` of travel fires `onCellClick` on `pointerup`; one that does fires `onCellSwap(row, col, targetRow, targetCol)` exactly once (dominant axis decides direction) and suppresses the click.
- Deliberately does **not** use the native `click` event to detect a tap — post-drag `click` firing is inconsistent across browsers/devices, so press-vs-drag is tracked manually and resolved on `pointerup`.
- BLOCKED/ghost cells keep the old plain `click` listener (nothing to drag there).
- `renderBoard()`'s `options` gained `onCellSwap`; `main.js` added `renderBoardWithInteractions(extraOptions)` — a thin wrapper that injects `{ onCellSwap: onCellDragSwap }` into every `renderBoard()` call site, so no call site had to be updated individually beyond the initial swap.
- `main.js`'s new `onCellDragSwap(r1, c1, r2, c2)` mirrors `onCellClick`'s guard checks (busy, placementMode, bounds, BLOCKED) but skips the `selected` state machine entirely and calls `attemptSwap()` directly. **`attemptSwap()` itself has zero awareness of which input method triggered it** — by design.
- `constants.js`: `DRAG_SWAP_THRESHOLD_PX = 16`.
- `layout.css`: `.cell` gained `touch-action: none; user-select: none;` so a drag on mobile doesn't scroll the page or select text.

**Known simplification:** this is a "flick to swap," not a live drag — the gem doesn't visually track the pointer before the swap fires; the existing swap animation just takes over once the threshold is crossed. Flagged, not implemented — say the word if you want the gem to actually follow the cursor/finger (bigger render.js change).

---

## 3. Stuck-Board Game-Over Dialog

**Bug fixed:** `checkEndState()`'s "no legal move left, `PREVENT_DEADLOCK` off" branch used to just set a status message and return — `busy` was never touched, so the board stayed fully clickable/draggable on a board that was actually over (every swap would just silently revert).

**Fix:** that branch now sets `busy = true` immediately, shows `MESSAGES.STUCK_BOARD`, and after `NO_MOVES_GAME_OVER_DELAY_MS` (2000ms, `constants.js`) calls `showNoMovesDialog()`.

- `showNoMovesDialog()` (new, `main.js`) reuses `loseDialogEl` — **not** a separate dialog element — but sets `loseTitleEl`/`loseMessageEl` text fresh each call (`DIALOG_TITLES.NO_MOVES` / `MESSAGES.NO_MOVES_GAME_OVER`, both new in `text.js`).
- Because the element is now shared between two distinct scenarios (moves-limit lose vs. stuck-board), `showLoseDialog()` was also updated to explicitly set `loseTitleEl.textContent = DIALOG_TITLES.LOSE` on every call, rather than relying on `applyStaticText()`'s one-time assignment (which would otherwise leave a stale title from whichever dialog last showed).
- `loseRestartBtn`'s handler is unchanged and works for both cases (always → start screen).

---

## 4. Boon-Card Gem Icon

Gem-scoped boons (every per-gem archetype — Affinity/Bounty/Frenzy/etc.) now show a small icon of the gem they affect next to the card's **title**, inside a new `.boon-card-header` wrapper.

- `showBoonDialog()` looks the gem up via `ALL_GEM_CATALOG.find(g => g.id === def.effect.gem)` (not just the 7 active `GEM_DEFINITIONS`, so this keeps working if a locked gem's boon is ever offered once `gemUnlockState` gets a real unlock path). Global boons (no `effect.gem`) get no icon.
- CSS: `.boon-card-header` (flex row), `.boon-card-header h3` (overrides `.boon-card h3`'s own margin), `.boon-card-gem-icon` (22px) — all in `dialog.css`.
- **Considered and declined:** inlining the icon exactly where the gem's name appears inside the description text (via regex replace). Two problems made this not worth it: some descriptions say the gem's name twice (Frenzy, Lust — including inside "non-Gem"), which would clutter the one sentence explaining a *penalty* with two icons; and it couples icon placement to exact generated wording rather than structured data. Title-only was the final call.

---

## 5. Deferred Level-Up Dialog

**Behavior change:** the level-up dialog used to appear the instant a cascade step crossed the score target — interrupting mid-chain-reaction, before that step's own cells had even cleared/collapsed. It now waits until the **entire** cascade (every chain-reaction step, every spawn, every gravity/refill) has fully settled, across both the normal match path and all swap-activated combos.

- New module-level flag in `main.js`: `pendingLevelUp`. Set (not acted on) whenever `applyScoreGain()` returns `true`, in both `resolveMatches()` and `finishSwapActivatedCombo()`. Both functions now **always** call `continueCascadeAfterMatch()` regardless of level-up — no more branching there.
- The single point this flag is ever consumed: `resolveMatches()`'s `!hasAnyMatch(matched)` branch (i.e. cascade is provably stable). If `pendingLevelUp` is true there, it's cleared and `showLevelUpDialog()` fires; its `onContinue` is now just `checkEndState()` (there's nothing left to "resume" — the cascade already finished).
- Swap-activated combos (Hyperstar/Laser/Discharger, all of them) get this for free: they all funnel through `continueCascadeAfterMatch()` → `resolveMatches()` too, so the same single check point covers them.

**Bugfix found during testing:** the first version of this left `busy` stuck `true` forever after picking a boon post-level-up, because `showLevelUpDialog(() => checkEndState())`'s callback never reset it (the old code's `!hasAnyMatch` branch used to set `busy = false` right before `checkEndState()`, but that line was bypassed once cascade resolution detoured through the dialog). **Fix:** the callback is now `showLevelUpDialog(() => { busy = false; checkEndState(); })`. This is the only place `busy` gets released on this path now.

---

## 6. Gem Stats Panel — Gem Icon

Each row in the left-side Gem Stats panel now shows a small gem icon (`.gem-stat-icon`, 14px, `css/model/svg/` — same svgs the board itself uses) **inline with the gem's name**, at the top of the row.

- Went through one iteration first (icon next to the "match" stat instead) before landing here — if you're diffing against an intermediate version, the icon's `<img>` moved from inside `.gem-stat-bonus` to the front of `.gem-stat-name`. `renderSideStats()` now destructures `file` off `GEM_DEFINITIONS` alongside `id`/`name` to build the `src`.
- No CSS changes needed for the final placement — `.gem-stat-icon`'s existing rule (defined once, in `layout.css`) works inline in either spot.

---

## 7. Star Gem → Discharger (Full Rework)

**Rename:** `SPECIAL_GEM_TYPE.STAR` (value `'star'`) → `SPECIAL_GEM_TYPE.DISCHARGER` (value `'discharger'`). Since `render.js` builds its CSS class generically off the type value (`specialType.replace(/_/g, '-')`), no render.js change was needed — only `gems.css`'s `.gem--star::after` → `.gem--discharger::after` had to be renamed by hand.

**Spawn trigger is unchanged:** still a non-straight (L/T shape) match of 4+ cells (`classifyGroup()` in `js/gameplay/special_gem.js`).

**Behavior is now split across four distinct situations**, up from one fixed effect:

| Trigger | Effect | New function |
|---|---|---|
| Matched normally / hit by a chain-reaction blast | Clears a **3×3 area centered on itself** — REPLACES the old row+column+diagonals burst as the passive effect | `dischargerBlastCells(row, col)` (new) |
| Swapped with a **Laser** | Clears **3 full rows** (if `LASER_ROW`) or **3 full columns** (if `LASER_COL`), centered on wherever the **Discharger itself** ended up (not just the swap destination — see design note below) | `triggerDischargerLaserCombo()` (new) |
| Swapped with **another Discharger** | The OLD row+column+diagonals burst — moved here from the passive effect, now swap-exclusive — centered on the swap **destination** | `triggerDischargerDouble()` (new), using `radialBurstCells()` (renamed from `starBlastCells()`) |
| Swapped with a **Hyperstar** | Mirrors Hyperstar+Laser exactly: converts every board gem of the Discharger's color into a Discharger and detonates each one (3×3 each) | `triggerHyperstarDischargerCombo()` (new) |

**Design note — why "wherever it landed" instead of the swap destination:** Discharger+Laser is *asymmetric* (it matters which side is the Discharger, since that determines the blast's center), so it mirrors the existing Hyperstar-combo convention of tracking "wherever the acting special gem ended up" rather than blindly using `r2`/`c2`. Discharger+Discharger is *symmetric* (either side is fine), so it uses the destination cell — same convention `Laser+Laser` already used.

**`attemptSwap()`'s priority-ordered case list** grew from 5 to 8:

1. Hyperstar + Hyperstar → wipe board
2. Hyperstar + Laser → convert-and-detonate (lasers)
3. **Hyperstar + Discharger → convert-and-detonate (dischargers)** *(new)*
4. Hyperstar + a **plain normal gem** → classic same-color wipe *(narrowed — used to also catch Star; now Laser and Discharger both have dedicated cases, so this only ever fires for an ordinary gem)*
5. Laser + Laser → combined row+column blast
6. **Discharger + Laser → 3 rows/columns** *(new)*
7. **Discharger + Discharger → row+column+diagonals burst** *(new)*
8. otherwise → normal `findMatches()` check

All three new combos are scored as incidental cells (mixed colors), same reasoning as the existing Laser/Hyperstar combos, and go through the same `finishSwapActivatedCombo()` tail (move spend, combo reset, score, pop animation, cascade continuation).

`SPECIAL_GEM_INFO` (resource file) descriptions were updated for `LASER_ROW`/`LASER_COL`/`DISCHARGER`/`HYPERSTAR` to mention the new cross-combos.

---

## 8. Hint Feature

After `HINT_DELAY_MS` (10000ms, `constants.js`) of idle time since the last **real match** (including a swap-activated special-gem combo), a legal move is highlighted with a pulsing golden glow.

- `board.js`'s new `findHintMove(grid)` — same brute-force approach as `hasPossibleMove()` (try every adjacent swap on a scratch grid, check `findMatches`), but collects **every** legal swap found and returns one at random (`null` if none exist — that case is handled separately, by the stuck-board game-over path in Section 3).
- `render.js`'s new `showHintHighlight(boardEl, cells)` adds a `.cell--hint` class to two cells. **No matching "clear" function exists on purpose** — the next `renderBoard()` call (any swap, any cascade step, a reshuffle, a tile placement) wipes and rebuilds the whole board DOM anyway, which clears the class for free. This is what makes "the hint disappears once the player acts" work without extra bookkeeping.
- `layout.css`: `.cell--hint` + `@keyframes cell-hint-pulse` (pulsing `box-shadow` glow, 1.1s loop).
- `main.js`: `hintTimeoutId` (module state) + `scheduleHintTimer()` / `showHintNow()`.

**Reset semantics — read carefully, this was a deliberate design choice, not an oversight:** `scheduleHintTimer()` is called from **exactly one place** — the truly-idle tail of `checkEndState()` (plus once from `init()`, for the very first idle moment before any match has ever happened). Every call to `checkEndState()` is itself only ever reached as a consequence of a real match/cascade having just resolved. This means the 10-second countdown **only** resets on a genuine match — a failed/invalid swap attempt, or a plain click/select with no swap, does **not** reset it. `attemptSwap()` does cancel the pending timeout the instant a swap is attempted (so a hint can never pop up mid-animation/mid-cascade), but it's canceled, not rescheduled — if that swap turns out invalid and reverts, no new countdown starts until the next real match.

**Shows once, no re-loop:** once a hint is shown, nothing re-triggers it — it just sits there (pulsing) until the player takes any action that causes a re-render, which wipes it.

---

## 9. File Layout Delta (this part)

```text
js/
├── gameplay/
│   ├── board.js         (+ findHintMove())
│   ├── render.js         (+ wireCellInteraction() [internal], + showHintHighlight();
│   │                        renderBoard()'s options gained onCellSwap)
│   ├── special_gem.js    (+ dischargerBlastCells(), + triggerDischargerDouble(),
│   │                        + triggerDischargerLaserCombo(), + triggerHyperstarDischargerCombo();
│   │                        starBlastCells() renamed to radialBurstCells();
│   │                        classifyGroup()/resolveSpecialGems() dispatch updated for DISCHARGER)
│   └── main.js           (+ onCellDragSwap(), + renderBoardWithInteractions(),
│                             + scheduleHintTimer()/showHintNow(), + showNoMovesDialog(),
│                             + handleDischargerLaserCombo()/handleDischargerDouble()/
│                               handleHyperstarDischargerCombo();
│                             new state: pendingLevelUp, hintTimeoutId;
│                             attemptSwap()'s case list expanded 5 -> 8;
│                             resolveMatches()/finishSwapActivatedCombo() reworked (deferred dialog);
│                             checkEndState() reworked (stuck-board dialog + hint reschedule);
│                             renderSideStats() gains inline gem icon)
│
└── resources/
    ├── constant/
    │   ├── constants.js   (+ DRAG_SWAP_THRESHOLD_PX, + NO_MOVES_GAME_OVER_DELAY_MS, + HINT_DELAY_MS)
    │   └── text.js        (+ DIALOG_TITLES.NO_MOVES, + MESSAGES.NO_MOVES_GAME_OVER)
    │
    └── special gem/
        └── special_gem.js (SPECIAL_GEM_TYPE.STAR -> DISCHARGER; SPECIAL_GEM_INFO updated)

css/
├── design/
│   ├── layout.css   (.cell gains touch-action/user-select; + .cell--hint + @keyframes;
│   │                  + .gem-stat-icon)
│   └── dialog.css    (+ .boon-card-header, .boon-card-header h3, .boon-card-gem-icon)
└── model/
    └── gems.css       (.gem--star::after -> .gem--discharger::after)
```

---

## 10. Feature Status (delta)

| Feature | Status |
|---|---|
| Click-to-swap | Done (unchanged) |
| **Drag-to-swap** | **Done** — coexists with click-to-swap |
| **Stuck-board game over** | **Done** — was silently broken before this part |
| **Boon-card gem icons** | **Done** — title only |
| **Deferred level-up dialog** | **Done** — covers normal cascades + all swap combos |
| **Gem Stats panel icons** | **Done** — inline with gem name |
| **Discharger (renamed Star)** | **Done** — 4 distinct behaviors depending on trigger |
| **Hint feature** | **Done** — 10s idle, real-matches-only reset, shows once |

---

## 11. Gotchas (new this part)

### Drag is a flick, not a live drag
The gem does not visually track the pointer/finger before the swap commits — press, move past `DRAG_SWAP_THRESHOLD_PX` in a direction, the swap fires and the existing slide animation takes it from there. If a "gem follows your finger" feel is wanted later, that's a bigger `render.js` change (continuous position tracking + a cancel-on-release path), not a small tweak.

### The lose dialog is now shared by two unrelated scenarios
`loseDialogEl`/`loseTitleEl`/`loseMessageEl` back BOTH the `ENABLE_MOVES_LIMIT` "out of moves" case (`showLoseDialog()`) and the stuck-board "no legal moves" case (`showNoMovesDialog()`). Both functions set the title/message text explicitly on every call — don't reintroduce a one-time `applyStaticText()`-only title assignment, or whichever dialog showed last will leak its title into the other.

### `pendingLevelUp` is the ONLY thing that defers the dialog — nothing else should call `showLevelUpDialog()` mid-cascade
If you add a new swap-activated combo or a new cascade-adjacent code path later, route its "did we cross a target" check through the same `if (leveledUp) pendingLevelUp = true;` pattern and let `resolveMatches()`'s `!hasAnyMatch` branch be the only place the dialog actually shows. Calling `showLevelUpDialog()` directly from a new code path would reintroduce the mid-cascade-interruption bug this part fixed.

### `busy` must be explicitly released inside the level-up dialog's continuation
See Section 5's bugfix. If you ever change what `onContinue` does in `resolveMatches()`'s `pendingLevelUp` branch, make sure `busy = false` still happens somewhere in that chain — nothing else resets it on this path anymore.

### Discharger+Laser tracks the Discharger's landing cell, not the swap destination
Don't "simplify" `handleDischargerLaserCombo()`/`triggerDischargerLaserCombo()` to just use `r2`/`c2` like `Laser+Laser` does — that combo is symmetric (either side is a laser) and this one isn't (which side is the Discharger determines the blast center). This mirrors the existing Hyperstar-combo convention on purpose.

### The hint's "clear" is implicit
`showHintHighlight()` has no paired `clearHintHighlight()` — it relies on the fact that every `renderBoard()` call rebuilds the DOM from scratch. If a future change ever mutates the board WITHOUT going through `renderBoard()` (there isn't one today, but flagging it), a stale `.cell--hint` class could linger. Route any such change through `renderBoardWithInteractions()` instead.

### The hint countdown resets ONLY via `checkEndState()`
Per explicit design: a failed/invalid swap does NOT restart the 10-second clock — only `checkEndState()` (reached only after a real match/cascade fully resolves) reschedules it. If you add a new place where the game returns to an idle, waiting-for-input state that ISN'T downstream of a real match, do NOT call `scheduleHintTimer()` from it, or you'll silently change this behavior.