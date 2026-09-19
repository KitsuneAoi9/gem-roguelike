# Handoff — Part 2: Board Expand/Shrink

This is a continuation of the main handoff doc. Scope: replacing the
button-driven Construct/Deconstruct feature with a boon-driven
**board expand/shrink** mechanic.

---

## 1. Scope of this round

Replaced the button-driven Construct/Deconstruct feature with a
boon-driven **board expand/shrink** mechanic. The old "construct =
mark a bonus-scoring zone" feature is renamed to `markBonusTile()`
and kept fully dormant, unused, pending a future bonus-tile boon list
(per the design doc, both features are meant to coexist eventually).

### Terminology decided this round

| Old term | New term | Meaning now |
|---|---|---|
| `constructTile()` | `markBonusTile()` (dormant) | Flags already-usable cells as a future scoring bonus zone. Unused. |
| `deconstructTile()` | `shrinkBoard()` | Removes usable cells from the board (blocks them). |
| *(new)* | `expandBoard()` | Unblocks previously-blocked cells, growing the board. |
| Construct/Deconstruct buttons | *(removed)* | Placement is now entirely boon-driven — see below. |

---

## 2. Board sizing model

- The grid is now allocated at `MAX_BOARD_SIZE` (20×20) from the
  moment a run starts, not resized at runtime. A fresh run centers an
  `INITIAL_BOARD_SIZE` (8×8) usable square inside it; everything else
  starts `BLOCKED`. `board.js`'s `SIZE` constant **is**
  `MAX_BOARD_SIZE` now — every existing loop (`findMatches`,
  `hasPossibleMove`, `collapseAndFill`, `createGridNoMatches`)
  already treats `BLOCKED` as "skip," so this required zero logic
  changes in those functions, only a bigger loop bound.
- `expandBoard()` unblocks cells within this pre-allocated space;
  `shrinkBoard()` blocks them. Both go through the exact same
  `tileState.blockedCells` ledger a deadlock reshuffle already
  reads — no separate "board size" state was introduced.
- The player only ever sees the smallest rectangle containing usable
  cells (`board.js`'s new `getActiveBounds()`), so an 8×8 start
  doesn't look like a mostly-empty 20×20 sheet. `render.js` crops to
  this rectangle on every draw and drives the CSS grid template
  inline (JS-computed, no longer a fixed `repeat(8, 46px)`).

---

## 3. Expand-board placement UX: "ghost cells"

Since the vast majority of the allocated grid is `BLOCKED` and
hidden, the player can't click a cell they can't see to anchor an
expansion. While an expand-board placement is active, `tiles.js`'s
`getExpandableCells()` finds every `BLOCKED` cell with at least one
orthogonally-usable neighbor, and `render.js` draws just that ring as
dashed, clickable "ghost" cells (`.cell--ghost`), temporarily
widening the drawn rectangle to include them. Shrink-board placement
needs no such thing — its targets are already-visible usable cells.

---

## 4. Validation rules (asymmetric on purpose)

- **`expandBoard()`** is lenient exactly once: a shape that would
  overhang past `MAX_BOARD_SIZE` gets clipped to whatever fits,
  rather than failing outright (per the design doc's 19×19-board
  example). Every other failure mode (overlapping an already-usable
  cell anywhere in the shape; touching no existing usable cell at
  all) rejects the whole click.
- **`shrinkBoard()`** has no leniency at all — every cell in the
  shape must already be usable board, or the whole click fails. This
  mirrors the old `deconstructTile()` exactly; only the name changed.
- Adjacency for expansion is **orthogonal only** (no diagonals) —
  confirmed explicitly.
- Shape bounding boxes are capped at 5 rows × 5 cols (`constants.js`'s
  `TILE_SHAPES`) — confirmed explicitly, "max row 5 or max column 5."
- Shapes are always placed exactly as defined — **no player-side
  rotation**, confirmed explicitly.

---

## 5. Placement flow

- Picking a board-shape boon (`effect.kind` one of `board_expand` /
  `board_shrink` / `board_expand_and_shrink`) from the boon dialog
  detours `main.js` into a mandatory placement sequence
  (`startTilePlacement()` → `advanceTilePlacement()`) instead of
  resuming the cascade immediately. This is safe because the boon
  dialog only ever appears after a cascade has already fully settled,
  so there's no "cascade needs to resume RIGHT NOW" pressure —
  confirmed explicitly, no cancel option exists or is needed.
- A combined risky boon (`board_expand_and_shrink`) runs its expand
  phase **before** its shrink phase — confirmed explicitly ("addition
  first, then removal"). The two phases are fully manual, one click
  each, in sequence.
- Shrink's target is intended to be a **pre-existing** usable cell —
  it should never be able to target cells the same boon just added in
  its expand phase. **This is not yet actually enforced** — see the
  Known Gap section below.
- Once every phase is placed, `main.js` runs a full **no-score**
  reshuffle (`tiles.js`'s `rebuildGridRespectingBlocked()`): every
  non-blocked cell gets a fresh random gem type, but
  `specialGemState` is left completely untouched, so every special
  gem stays pinned at its board position — confirmed explicitly. This
  is a different (lighter) reshuffle than the existing deadlock
  reshuffle, which also wipes all specials via `resetSpecialGems()`.
- Deconstructing (shrinking away) a cell that holds a special gem
  removes the gem outright rather than triggering its blast —
  confirmed explicitly. `main.js` calls `clearSpecialGems()` on the
  returned cell list immediately after a successful `shrinkBoard()`
  call.

---

## 6. Known gap introduced this round (needs a decision)

**Shrink-phase-targeting-the-same-boon's-expand-cells is not actually
prevented.** The design doc says removal in a combined boon should
only target pre-existing cells, not cells the same boon just added —
but as implemented, `shrinkBoard()` has no way to distinguish "was
usable before this boon started" from "became usable a few seconds
ago because this boon's expand phase just ran." Since expand always
runs first, by the time shrink's phase begins, freshly-expanded cells
are indistinguishable from old ones in `grid`/`tileState`.

If this needs to be enforced (rather than just relying on players not
doing it, or deciding it's harmless if they do), the fix is
straightforward: `startTilePlacement()` can snapshot the set of
usable cells *before* the expand phase runs, and pass that snapshot
through to the shrink phase's validation as an extra allowed-target
restriction. Flagging rather than guessing at whether this is wanted,
since "harmless if it happens" is a plausible reading of the original
ask too.

---

## 7. Files touched this round

- `constants.js` — `INITIAL_BOARD_SIZE`/`MAX_BOARD_SIZE` added,
  `TILE_SHAPES` expanded (11 new shapes, all ≤5×5).
- `board.js` — `SIZE` now equals `MAX_BOARD_SIZE`;
  `createGridNoMatches()` gained an `isBlocked` predicate parameter;
  new `getActiveBounds()`.
- `tiles.js` — `constructTile`/`deconstructTile` renamed/replaced by
  `markBonusTile` (dormant) / `shrinkBoard`; new `expandBoard()`,
  `getExpandableCells()`, `rebuildGridRespectingBlocked()`;
  `resetTiles()` now seeds the starting blocked ring.
- `render.js` — bounds-aware, ghost-cell-aware rendering; dynamic CSS
  grid template; all pixel/index math now reads `boardEl.dataset`
  instead of assuming a fixed `SIZE`-wide board.
- `text.js` — two new static error messages.
- `index.html` — Construct/Deconstruct buttons and the shape-picker
  UI removed entirely.
- `layout.css` — `.cell--ghost` styling added; now-dead
  `.tile-controls`/`.tile-mode-buttons`/`.shape-picker` rules removed.
- `progression.js` (gameplay) — `BOARD_SIZE` import renamed to
  `INITIAL_BOARD_SIZE` (semantic rename only).
- `main.js` — imports, DOM refs, state, `init()`,
  `handlePlacementClick()` rewritten, `startTilePlacement()`/
  `advanceTilePlacement()` added, boon-dialog wiring, deadlock
  reshuffle simplified. Old button-driven `enterPlacementMode()`/
  `cancelPlacement()`/`chooseShape()` removed.
- `boon.js` (resources) / `boon_effects.js` — additive: new pool
  entries (`quarry_extension`, `open_pit_expansion`,
  `condemned_shaft`, `collapsing_vein`), new dispatcher cases
  (`board_expand`/`board_shrink`/`board_expand_and_shrink`) with a
  documented Rule-11 exception (these three kinds are deliberately a
  no-op in `applyBoonEffect()` — the actual grid mutation happens
  later, once the player places the shape).

### Not touched / still dormant

- `markBonusTile()`/`installedTiles` scoring-bonus mechanic —
  untouched, unused, waiting on a future bonus-tile boon list per the
  design doc's Section E.
- Shop integration — unchanged from prior handoff, still not wired
  into `main.js`.

---

## 8. Verification note

All source files this round's implementation was written against
(`main.js`, `boon.js` gameplay + resources, `boon_effects.js`,
`tiles.js`, `constants.js`, `board.js`, `render.js`, `text.js`,
`index.html`, `layout.css`, `progression.js`) were checked directly
against the project's current uploaded files and confirmed to match
exactly — no drift between what this round's patches assume and what
actually exists in the project.
