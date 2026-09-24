# Handoff — Part 6: Two Bugfixes (Side-Stats Tooltip Clipping, Hyperstar-on-Hyperstar Wipe)

Continues directly from Part 5. Scope: two standalone, tester-reported bugfixes — no new
features, no redesigns.

---

## 1. Bugfix — side-stats tooltip text was cut off

**Reported symptom:** hovering "Global Multiplier"/"Global Bonus" in the left-side Gem
Stats panel showed a tooltip box whose text was visibly cut off partway through several
lines (see reported screenshot).

**Root cause:** `#side-stats` is `200px` wide with `14px`/`16px` padding, leaving roughly
`168px` of actual content width. The tooltip (`.side-stat-label--info:hover::after`) was
set to `width: 220px` — wider than the panel itself. Because `#side-stats` has
`overflow-y: auto`, the browser also clips the X-axis by spec (setting overflow on one axis
forces the other axis to `auto`/clipping too, even though nothing asked it to), so the
~52px of tooltip that spilled past the panel's right edge was hard-cut instead of just
wrapping onto another line.

**Fix:** `.side-stat-label--info:hover::after`'s `width` reduced from `220px` to `160px` —
comfortably inside the panel's ~168px content box (8px safety margin). The tooltip is now
a bit taller (wraps onto more lines) instead of a bit wider, but stays fully visible.

This was a plain CSS value fix — no layout/positioning redesign was needed, and none of
the surrounding markup or JS changed.

**Files touched:** `css/design/layout.css` (`.side-stat-label--info:hover::after`).

---

## 2. Bugfix — a Hyperstar's same-color wipe/convert combos could destroy a SECOND Hyperstar

**Reported symptom:** with two Hyperstars both spawned from Ruby sitting on the board,
swapping a plain Ruby gem with Hyperstar #1 (triggering the classic same-color wipe)
always also destroyed Hyperstar #2, even though nothing was done to it directly.

**Root cause:** `triggerHyperstarSingle()` (and, found while fixing this, the two
convert-and-detonate combos `triggerHyperstarLaserCombo()`/`triggerHyperstarDischargerCombo()`)
decide what to clear/convert purely by scanning the plain `grid[][]` for cells matching the
target color. Per Rule 9, a special gem's cell still carries its underlying color in
`grid[][]` — only its behavior/visual is overridden via `specialGemState`. So a second
Hyperstar sitting on a Ruby-colored cell looked, to this scan, like "just another Ruby" and
got swept up right along with every plain Ruby gem on the board.

This is the same category of bug Part 4 §24 already fixed for `board.js`'s `findMatches()`
— Hyperstar is documented as **swap-activated only**; nothing should be able to destroy one
except a swap that deliberately targets it (Hyperstar+Hyperstar → `triggerHyperstarDouble()`).
That protection had never been extended to the wipe/combo functions in
`gameplay/special_gem.js`.

**Scope of the fix — all three SAME-COLOR-SCANNING Hyperstar functions:**
- `triggerHyperstarSingle()` (Hyperstar + plain gem — the reported case)
- `triggerHyperstarLaserCombo()` (Hyperstar + Laser — same bug, same fix, found while
  investigating the reported issue; not separately reported, but identical root cause)
- `triggerHyperstarDischargerCombo()` (Hyperstar + Discharger — same as above)

All three now check `specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR` before
clearing/converting a same-color cell, and skip it entirely if so — the second Hyperstar is
left completely untouched (not cleared, not scored, not converted).

**Explicitly NOT touched — a different, already-known gap:** the *area*-shaped blasts
(Laser/Discharger's row/column/burst clears, and Hyperstar+Hyperstar's full-board clear)
don't scan by color at all — they clear a physical shape. A Hyperstar sitting inside one of
those blast areas can still be swept up. This is the pre-existing, already-flagged
simplification from Part 4 §24 ("If a Laser or Discharger's blast happens to pass through a
cell holding a Hyperstar... left as-is pending a decision") — untouched by this round,
different code path, different bug class (area-based vs. color-based).

**Files touched:** `js/gameplay/special_gem.js` (`triggerHyperstarSingle`,
`triggerHyperstarLaserCombo`, `triggerHyperstarDischargerCombo`).

---

## Known gaps / flagged simplifications carried into this round

- **Area-based blasts can still incidentally clear a Hyperstar** (see §2 above) — this is
  the Part 4 §24 gap, still open, still a deliberate non-fix pending a design decision.
- **The side-stats tooltip is now taller, not wider** — on a very short viewport, a tooltip
  triggered near the bottom of the panel's visible scroll area could still get clipped
  vertically by the same `overflow-y: auto`. Not reported, not addressed this round; flag
  if it turns out to matter in practice.
