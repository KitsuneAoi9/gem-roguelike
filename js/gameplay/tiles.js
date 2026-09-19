// ============================================================
// TILES.JS — board expansion/shrinking, plus the still-dormant
// bonus-tile marking feature.
//
// Reads/writes tileState (../../resources/tile/tile_state.js) but owns none
// of the state itself — same split as boon.js/shop.js. Unlike those
// two, this module also mutates the live grid directly (expandBoard/
// shrinkBoard write BLOCKED or a fresh gem type straight into it),
// since "which cells exist at all" is a board-level fact, not just
// something to read later.
//
// TERMINOLOGY CHANGE THIS ROUND: "construct/deconstruct" used to mean
// "mark an already-usable cell as a scoring bonus zone." That old
// behavior is kept below as markBonusTile() — renamed, unused for
// now, dormant until the bonus-tile boon list arrives (see the design
// doc's Section E). "Construct/deconstruct" now means something new
// and more literal: expandBoard()/shrinkBoard() change which cells on
// the board exist at all. Naming them expand/shrink instead of
// reusing construct/deconstruct avoids the two concepts colliding in
// one pair of names.
// ============================================================

import {
  SIZE, BLOCKED, rand, GEM_TYPES_TOTAL, createGridNoMatches,
} from './board.js';
import {
  TILE_SHAPES, MAX_BOARD_SIZE, INITIAL_BOARD_SIZE,
} from '../resources/constant/constants.js';
import { tileState } from '../resources/tile/tile_state.js';

let nextTileId = 1;

/**
 * Checks whether a (row, col) coordinate falls inside the allocated
 * grid. Note this is the FULL allocated size (SIZE === MAX_BOARD_SIZE,
 * 20x20), not just the currently-visible/active part of the board —
 * that distinction matters for expandBoard(), which is allowed to
 * target cells well outside the currently-visible rectangle.
 *
 * @param {number} row - row index.
 * @param {number} col - column index.
 * @returns {boolean} true if (row, col) is within the allocated grid.
 */
function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * Translates a named shape's relative offsets into absolute board
 * cells, anchored at (anchorRow, anchorCol) as the shape's top-left.
 *
 * @param {string} shapeKey - key into TILE_SHAPES.
 * @param {number} anchorRow - row of the shape's top-left cell.
 * @param {number} anchorCol - column of the shape's top-left cell.
 * @returns {[number, number][]} absolute [row, col] pairs.
 */
export function getShapeCells(shapeKey, anchorRow, anchorCol) {
  const shape = TILE_SHAPES[shapeKey];
  if (!shape) return [];
  return shape.cells.map(([dr, dc]) => [anchorRow + dr, anchorCol + dc]);
}

/**
 * Whether every cell in the list is on the board and not already
 * blocked — used by shrinkBoard() to make sure the whole shape is
 * currently real, usable board before any of it gets removed.
 *
 * @param {[number, number][]} cells
 * @param {number[][]} grid
 * @returns {boolean}
 */
function allCellsUsable(cells, grid) {
  return cells.every(([r, c]) => inBounds(r, c) && grid[r][c] !== BLOCKED);
}

/**
 * True if a BLOCKED cell has at least one orthogonally-adjacent
 * usable neighbor — i.e. it's a valid "growth point" the board could
 * expand into. Diagonal neighbors don't count (see the design
 * decision: orthogonal adjacency only).
 *
 * Shared by expandBoard() (a shape needs at least one cell like this
 * to be a legal placement) and getExpandableCells() (which collects
 * every one of these to show as a clickable ghost cell).
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function hasUsableNeighbor(grid, row, col) {
  return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
    .some(([r, c]) => inBounds(r, c) && grid[r][c] !== BLOCKED);
}

/**
 * Removes one [row, col] entry from tileState.blockedCells, if
 * present. Called whenever expandBoard() successfully unblocks a
 * cell — the cell is no longer "deconstructed", so it shouldn't
 * still be in the ledger a future reshuffle uses to re-block cells.
 *
 * @param {number} row
 * @param {number} col
 * @returns {void}
 */
function removeBlockedCell(row, col) {
  const idx = tileState.blockedCells.findIndex(([r, c]) => r === row && c === col);
  if (idx !== -1) tileState.blockedCells.splice(idx, 1);
}

/**
 * Attempts to expand the board: unblocks every cell in the given
 * shape, anchored at (anchorRow, anchorCol), turning it from
 * unusable space into playable board.
 *
 * Three checks, in order, any of which can invalidate the whole
 * click:
 *   1. Boundary leniency — cells past MAX_BOARD_SIZE are dropped
 *      from the shape rather than failing it outright (e.g. a 2-row
 *      strip anchored one row before the edge becomes a 1-row strip).
 *      This is the ONE place expandBoard() is forgiving; every other
 *      failure below rejects the whole click.
 *   2. Every surviving cell must currently be BLOCKED. Overlapping
 *      even one already-usable cell fails the whole placement — we
 *      never want to silently skip "half the shape" onto existing
 *      board, since that could produce a smaller-than-intended result
 *      the player didn't ask for.
 *   3. At least one surviving cell must touch the existing usable
 *      board (orthogonally). Without this, a shape placed far away
 *      would create a sealed-off island no swap could ever reach.
 *
 * @param {string} shapeKey - key into TILE_SHAPES.
 * @param {number} anchorRow - row of the shape's top-left cell.
 * @param {number} anchorCol - column of the shape's top-left cell.
 * @param {number[][]} grid - the live grid, mutated in place on success.
 * @returns {[number, number][] | null} the cells actually unblocked
 *   (after boundary clipping), or null if the placement was invalid.
 */
export function expandBoard(shapeKey, anchorRow, anchorCol, grid) {
  const rawCells = getShapeCells(shapeKey, anchorRow, anchorCol);
  if (rawCells.length === 0) return null;

  // Step 1 — drop anything past the allocated grid's edge instead of
  // failing outright. This is the documented exception for a shape
  // that overhangs the MAX_BOARD_SIZE ceiling.
  const clipped = rawCells.filter(([r, c]) => inBounds(r, c));
  if (clipped.length === 0) return null; // the whole shape fell off the edge — nothing to do

  // Step 2 — every surviving cell has to be BLOCKED right now. If any
  // one of them is already part of the usable board, reject the
  // entire click (see doc comment above for why this isn't lenient
  // the way the boundary check is).
  const allSurvivingCellsAreBlocked = clipped.every(([r, c]) => grid[r][c] === BLOCKED);
  if (!allSurvivingCellsAreBlocked) return null;

  // Step 3 — connectivity: at least one new cell has to be next to
  // the board that already exists.
  const touchesExistingBoard = clipped.some(([r, c]) => hasUsableNeighbor(grid, r, c));
  if (!touchesExistingBoard) return null;

  // All checks passed — unblock every surviving cell. The gem type
  // rolled here is only a placeholder: main.js always follows a
  // successful expand/shrink placement with a full board reshuffle
  // (rebuildGridRespectingBlocked()), so this value never actually
  // reaches the player's eyes unchanged.
  clipped.forEach(([r, c]) => {
    grid[r][c] = rand(GEM_TYPES_TOTAL);
    removeBlockedCell(r, c);
  });

  return clipped;
}

/**
 * Attempts to shrink the board: validates the shape fits on the
 * board and is entirely usable right now, then blocks every cell in
 * it and records them in tileState.blockedCells so a future reshuffle
 * keeps them blocked.
 *
 * Unlike expandBoard(), this has NO boundary leniency — every cell in
 * the shape must already be real, usable board, or the whole click is
 * rejected. (A shrink can never "overhang an edge" in the same sense
 * expand can, since it only ever targets cells that already exist.)
 *
 * Special-gem cleanup for a removed cell is NOT this function's job —
 * tiles.js doesn't know about specialGemState (Rule 5, one concern
 * per module). The caller (main.js) is expected to pass the returned
 * cell list into specialGems.js's clearSpecialGems() right after a
 * successful call here.
 *
 * @param {string} shapeKey - key into TILE_SHAPES.
 * @param {number} anchorRow - row of the shape's top-left cell.
 * @param {number} anchorCol - column of the shape's top-left cell.
 * @param {number[][]} grid - the live grid, mutated in place.
 * @returns {[number, number][] | null} the cells removed, or null if
 *   the placement was invalid.
 */
export function shrinkBoard(shapeKey, anchorRow, anchorCol, grid) {
  const cells = getShapeCells(shapeKey, anchorRow, anchorCol);
  if (cells.length === 0 || !allCellsUsable(cells, grid)) return null;

  cells.forEach(([r, c]) => {
    grid[r][c] = BLOCKED;
    tileState.blockedCells.push([r, c]);
  });
  return cells;
}

/**
 * Every BLOCKED cell that's a legal expandBoard() growth point right
 * now — i.e. has at least one usable orthogonal neighbor. main.js
 * calls this while an expand-board placement is active and passes
 * the result into render.js as `ghostCells`, so the player sees a
 * highlighted, clickable ring around the current board instead of
 * having to guess which invisible cell to aim for.
 *
 * This does NOT mean every one of these cells is individually a
 * valid anchor for the CURRENT shape being placed (a 3x1 shape
 * anchored at a valid growth point can still fail step 2 of
 * expandBoard() further along the shape) — it's a starting-point
 * hint, not a full placement preview.
 *
 * @param {number[][]} grid
 * @returns {[number, number][]}
 */
export function getExpandableCells(grid) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === BLOCKED && hasUsableNeighbor(grid, r, c)) {
        cells.push([r, c]);
      }
    }
  }
  return cells;
}

/**
 * Fully regenerates every non-blocked cell's gem type according to
 * tileState.blockedCells — i.e. "the board just changed shape, give
 * every usable cell a fresh random gem, honoring whatever's blocked
 * right now." Mutates `grid` in place (same convention as
 * collapseAndFill()) rather than returning a new array, so callers
 * don't have to remember to reassign their `grid` variable.
 *
 * Used in two places: main.js's init() (building the very first
 * grid around the freshly-seeded starting blocked ring) and right
 * after a successful expand/shrink placement sequence finishes. Also
 * a good fit for the existing PREVENT_DEADLOCK reshuffle in
 * checkEndState(), which used to do this same "regenerate + reapply
 * blocked cells" dance by hand — see main.js's patch notes.
 *
 * Does NOT touch specialGemState — tiles.js doesn't know that module
 * exists (Rule 5). The caller decides what happens to special gems
 * around this call (main.js's reshuffle keeps them for a boon-driven
 * placement, but wipes them entirely for a deadlock reshuffle — two
 * different call sites, two different choices, both live in main.js).
 *
 * @param {number[][]} grid - mutated in place.
 * @returns {void}
 */
export function rebuildGridRespectingBlocked(grid) {
  // A Set lookup is a lot cheaper than tileState.blockedCells.some(...)
  // once you're calling it SIZE*SIZE (400) times for a full rebuild.
  const blockedKeys = new Set(tileState.blockedCells.map(([r, c]) => `${r},${c}`));
  const fresh = createGridNoMatches((r, c) => blockedKeys.has(`${r},${c}`));

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      grid[r][c] = fresh[r][c];
    }
  }
}

/**
 * Marks an already-usable set of cells as a scoring bonus zone (the
 * OLD meaning of "construct", before this round's redesign). DORMANT
 * — nothing calls this yet. Kept around for the future bonus-tile
 * boon list mentioned in the design doc (Section E: "I want them to
 * exist eventually"). When that list arrives, wire it up the same way
 * expandBoard/shrinkBoard are wired now: a boon effect.kind, a
 * placement-mode phase, a click handler in main.js.
 *
 * @param {string} shapeKey - key into TILE_SHAPES.
 * @param {number} anchorRow - row of the shape's top-left cell.
 * @param {number} anchorCol - column of the shape's top-left cell.
 * @param {number[][]} grid - current grid, used only to check overlap
 *   with blocked cells.
 * @returns {{id: number, cells: [number, number][]} | null} the new
 *   tile, or null if the placement was invalid.
 */
export function markBonusTile(shapeKey, anchorRow, anchorCol, grid) {
  const cells = getShapeCells(shapeKey, anchorRow, anchorCol);
  if (cells.length === 0 || !allCellsUsable(cells, grid)) return null;

  const tile = { id: nextTileId++, cells };
  tileState.installedTiles.push(tile);
  return tile;
}

/**
 * Clears all bonus tiles and blocked cells, then re-seeds the
 * starting blocked ring for a fresh run: everything in the allocated
 * MAX_BOARD_SIZE x MAX_BOARD_SIZE grid OUTSIDE a centered
 * INITIAL_BOARD_SIZE x INITIAL_BOARD_SIZE square starts BLOCKED, so a
 * fresh run looks and plays exactly like the old fixed 8x8 board
 * until the player picks an expand-board boon.
 *
 * Call from main.js's init(), same as before — but note the ordering
 * requirement: init() must call this BEFORE building the initial
 * grid, since the grid-building step (rebuildGridRespectingBlocked())
 * reads tileState.blockedCells to decide what to leave blocked.
 *
 * @returns {void}
 */
export function resetTiles() {
  tileState.installedTiles.length = 0;
  tileState.blockedCells.length = 0;
  nextTileId = 1;

  // Center the INITIAL_BOARD_SIZE square inside the bigger allocated
  // grid so there's equal room to expand in every direction. E.g. with
  // an 8-wide start inside a 20-wide allocation, offset = 6 — rows/cols
  // 6..13 start open, 0..5 and 14..19 start blocked on each axis.
  const offset = Math.floor((MAX_BOARD_SIZE - INITIAL_BOARD_SIZE) / 2);

  for (let r = 0; r < MAX_BOARD_SIZE; r++) {
    for (let c = 0; c < MAX_BOARD_SIZE; c++) {
      const insideStartingSquare =
        r >= offset && r < offset + INITIAL_BOARD_SIZE &&
        c >= offset && c < offset + INITIAL_BOARD_SIZE;
      if (!insideStartingSquare) {
        tileState.blockedCells.push([r, c]);
      }
    }
  }
}

// TODO: shrinking a cell that's already part of a bonus tile
// (markBonusTile's installedTiles) doesn't currently clean that tile
// out of installedTiles — same open question as before this round,
// just renamed. Decide later whether that should split/shrink the
// tile or just be disallowed, once the bonus-tile boon list exists.