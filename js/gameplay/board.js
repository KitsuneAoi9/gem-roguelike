// ============================================================
// BOARD.JS — pure game logic, no DOM access.
//
// This file only knows about a grid of numbers. It doesn't know
// what a gem looks like or how it's drawn — that's render.js's job.
// Keeping this split means swapping render.js for a Phaser version
// later won't require touching any logic in here.
//
// SIZE CHANGE THIS ROUND: SIZE is now MAX_BOARD_SIZE (20), not the
// old fixed BOARD_SIZE (8). The grid is allocated at its maximum
// possible footprint from the start of every run — a fresh run just
// has almost everything BLOCKED except a centered starting square
// (see tiles.js's resetTiles()). Expand-board boons unblock more of
// this pre-allocated space; nothing in this file changes size at
// runtime, which keeps findMatches/collapseAndFill/hasPossibleMove
// exactly as simple as before — they already treat BLOCKED cells as
// "skip this," so a mostly-BLOCKED 20x20 grid behaves for them
// exactly like a smaller board would.
// ============================================================

import { MAX_BOARD_SIZE, GEM_TYPES_COUNT } from '../resources/constant/constants.js';

// Re-exported under shorter names since they're used constantly below.
export const SIZE = MAX_BOARD_SIZE;
export const GEM_TYPES_TOTAL = GEM_TYPES_COUNT;

// Sentinel for a permanently deconstructed cell — distinct from the
// transient -1 used mid-cascade for "matched, about to collapse".
// findMatches/collapseAndFill/hasPossibleMove all treat this as a
// cell that can never hold or pass a gem.
export const BLOCKED = null;

function isGem(value) {
  return typeof value === 'number' && value >= 0;
}

/**
 * Returns a random integer gem type in the range [0, numberVal].
 *
 * @param {number} numberVal - exclusive upper bound (typically GEM_TYPES_TOTAL).
 * @returns {number} a random integer from 0 to numberVal-1.
 */
export function rand(numberVal) {
  return Math.floor(Math.random() * numberVal);
}

/**
 * Builds a SIZE x SIZE grid with no pre-existing 3-in-a-row matches,
 * so the player doesn't start with a "free" match already on the board.
 *
 * @param {(row: number, col: number) => boolean} [isBlocked] - called
 *   for every cell; if it returns true, that cell is set to BLOCKED
 *   instead of getting a rolled gem type. Defaults to "nothing is
 *   blocked", which reproduces the old always-fully-open behavior.
 *   Callers pass in tileState.blockedCells (via tiles.js) so this
 *   function never has to know what a "tile" or a "boon" is — it
 *   just honors whatever predicate it's handed.
 * @returns {number[][]} a new SIZE x SIZE grid of gem type numbers
 *   (and BLOCKED wherever isBlocked said so).
 */
export function createGridNoMatches(isBlocked = () => false) {
  const grid = [];
  for (let row = 0; row < SIZE; row++) {
    const rows = [];
    for (let col = 0; col < SIZE; col++) {
      // A blocked cell never gets a gem — skip straight past the
      // re-roll loop below, since BLOCKED can never "match" anyway.
      if (isBlocked(row, col)) {
        rows.push(BLOCKED);
        continue;
      }

      let type;
      // Re-roll if this placement would immediately complete a
      // horizontal or vertical run of 3. Comparing against a BLOCKED
      // neighbor (null) against a numeric type is always false, so
      // this naturally treats "neighbor is blocked" the same as
      // "neighbor doesn't match" — no special-casing needed here.
      do {
        type = rand(GEM_TYPES_TOTAL);
      } while (
        (col >= 2 && rows[col - 1] === type && rows[col - 2] === type) ||
        (row >= 2 && grid[row - 1][col] === type && grid[row - 2][col] === type)
      );
      rows.push(type);
    }
    grid.push(rows);
  }
  return grid;
}

/**
 * Checks whether a (row, col) coordinate falls inside the board.
 *
 * @param {number} row - row index.
 * @param {number} col - column index.
 * @returns {boolean} true if (row, col) is a valid on-board cell.
 */
function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * Scans the whole grid for runs of 3+ identical values, horizontally
 * and vertically. Returns a same-shaped boolean grid marking every
 * cell that's part of some match (a cell can be in both a row-match
 * and a column-match at once).
 *
 * @param {number[][]} g - the grid to scan.
 * @returns {boolean[][]} a SIZE x SIZE grid, true where that cell is matched.
 */
export function findMatches(g) {
  const matched = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  // --- horizontal runs ---
  for (let r = 0; r < SIZE; r++) {
    let runStart = 0;
    for (let c = 1; c <= SIZE; c++) {
      // Extend the run while values keep matching (c === SIZE acts as
      // a sentinel "end of row" to flush the final run).
      if (c < SIZE && g[r][c] === g[r][runStart] && isGem(g[r][c])) continue;
      const runLen = c - runStart;
      if (runLen >= 3) {
        for (let k = runStart; k < c; k++) matched[r][k] = true;
      }
      runStart = c;
    }
  }

  // --- vertical runs (same logic, transposed) ---
  for (let c = 0; c < SIZE; c++) {
    let runStart = 0;
    for (let r = 1; r <= SIZE; r++) {
      if (r < SIZE && g[r][c] === g[runStart][c] && isGem(g[r][c])) continue;
      const runLen = r - runStart;
      if (runLen >= 3) {
        for (let k = runStart; k < r; k++) matched[k][c] = true;
      }
      runStart = r;
    }
  }

  return matched;
}

/**
 * Checks whether a "matched" grid (as returned by findMatches) contains
 * any matched cell at all.
 *
 * @param {boolean[][]} matched - grid returned by findMatches.
 * @returns {boolean} true if at least one cell is matched.
 */
export function hasAnyMatch(matched) {
  return matched.some(row => row.some(v => v));
}

/**
 * Brute-force check: try every adjacent swap on a scratch copy of the
 * grid and see if any of them produces a match. Used to detect a
 * stuck board so we know when to reshuffle.
 *
 * NOTE: now scans the full SIZE x SIZE (20x20) allocated grid rather
 * than a fixed 8x8 — still cheap (a few thousand cell/clone checks
 * worst case) and correct as-is, since a BLOCKED cell is skipped
 * immediately below and never considered a swap partner.
 *
 * @param {number[][]} g - the grid to check.
 * @returns {boolean} true if at least one legal swap would create a match.
 */
export function hasPossibleMove(g) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (g[r][c] === BLOCKED) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc) || g[nr][nc] === BLOCKED) continue;
        const clone = g.map(row => row.slice());
        [clone[r][c], clone[nr][nc]] = [clone[nr][nc], clone[r][c]];
        if (hasAnyMatch(findMatches(clone))) return true;
      }
    }
  }
  return false;
}

/**
 * Swaps two cells in place on the given grid.
 *
 * @param {number[][]} grid - the grid to mutate.
 * @param {number} row1 - row of the first cell.
 * @param {number} col1 - column of the first cell.
 * @param {number} row2 - row of the second cell.
 * @param {number} col2 - column of the second cell.
 * @returns {void}
 */
export function swap(grid, row1, col1, row2, col2) {
  const tmp = grid[row1][col1];
  grid[row1][col1] = grid[row2][col2];
  grid[row2][col2] = tmp;
}

/**
 * Removes matched cells (already set to -1 by the caller) by letting
 * everything above a gap fall down, then fills the newly-empty top
 * cells with fresh random gems. Column-by-column, bottom-up.
 *
 * BLOCKED cells act as fixed obstacles: each column collapses in
 * independent segments split at every BLOCKED cell, so gems never
 * fall past one.
 *
 * `parallelGrids` — optional same-size arrays (e.g. the special-gem
 * overlay) that should move in lockstep with the grid: a surviving
 * gem's parallel value follows it to its new position, and a freshly
 * spawned gem always gets `null` in every parallel grid. Lets other
 * per-cell metadata ride along with gravity without this function
 * knowing what that metadata means.
 *
 * @param {number[][]} g - the grid to mutate in place.
 * @param {any[][][]} [parallelGrids] - optional list of same-size
 *   grids to shift in lockstep, mutated in place.
 * @returns {void}
 */
export function collapseAndFill(g, parallelGrids = []) {
  for (let c = 0; c < SIZE; c++) {
    // A blocked cell is a fixed floor/ceiling — gems fall within
    // their own segment above/below it, never past it. r === -1 is a
    // sentinel that flushes the topmost segment.
    let segmentBottom = SIZE - 1;
    for (let r = SIZE - 1; r >= -1; r--) {
      const atBoundary = r === -1 || g[r][c] === BLOCKED;
      if (!atBoundary) continue;

      const col = [];
      const parallelCols = parallelGrids.map(() => []);
      for (let rr = segmentBottom; rr > r; rr--) {
        if (g[rr][c] !== -1) {
          col.push(g[rr][c]);
          parallelGrids.forEach((pg, i) => parallelCols[i].push(pg[rr][c]));
        }
      }
      // Fill the rest of the column with new random gems, and nulls in the parallel grids.
      while (col.length < segmentBottom - r) {
        col.push(rand(GEM_TYPES_TOTAL));
        parallelGrids.forEach((_, i) => parallelCols[i].push(null));
      }
      for (let rr = segmentBottom, i = 0; rr > r; rr--, i++) {
        g[rr][c] = col[i];
        parallelGrids.forEach((pg, pgi) => { pg[rr][c] = parallelCols[pgi][i]; });
      }
      segmentBottom = r - 1;
    }
  }
}

/**
 * Finds the smallest rectangle that contains every currently-usable
 * (non-BLOCKED) cell in the grid. This is what render.js uses to
 * decide what to actually draw — most of the allocated SIZE x SIZE
 * grid is BLOCKED padding the player should never see, so rendering
 * always crops to this rectangle (plus, during board-expansion
 * placement, whatever ghost cells are being offered — see
 * tiles.js's getExpandableCells() and render.js's ghostCells option).
 *
 * Pure grid math, no DOM — stays in board.js per Rule 2.
 *
 * @param {number[][]} grid - the grid to scan.
 * @returns {{minRow: number, maxRow: number, minCol: number, maxCol: number}}
 *   bounds of the usable area. Falls back to a single cell at (0,0)
 *   if somehow nothing is usable, so callers never have to guard
 *   against Infinity leaking out of this function.
 */
export function getActiveBounds(grid) {
  let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === BLOCKED) continue;
      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;
    }
  }
  if (minRow === Infinity) return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 };
  return { minRow, maxRow, minCol, maxCol };
}