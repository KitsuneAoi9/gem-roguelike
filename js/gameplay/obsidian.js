// ============================================================
// OBSIDIAN.JS (gameplay) — support logic for the Obsidian "dead gem"
// sentinel (board.js's OBSIDIAN value).
//
// Two responsibilities, one concern each (Rule 5):
//   1. pickObsidianTargetCell() — where a freshly-spawned Obsidian
//      gem should land on the board. Called by special_gem.js's
//      resolveSpecialGems() when Entropy/Luminous/Explosive Shard's
//      "also 10% chance of creating an Obsidian gem" roll succeeds.
//   2. settleObsidianOffBoard() — the "falls off the board" cleanup:
//      after gravity settles, any column whose bottom-most usable
//      cell holds an Obsidian gem loses it (it crumbles away), and
//      everything above re-settles into the gap. This can chain (a
//      second Obsidian sitting right above the first becomes the new
//      bottom once the first one is gone), so it loops until stable.
//
// Obsidian is NOT part of specialGemState — it lives directly in the
// main grid (see board.js's OBSIDIAN constant doc comment for why).
// This file therefore only ever touches the plain grid + whatever
// parallel grids the caller hands it (same "generic parallel shift"
// convention board.js's collapseAndFill() already uses).
// ============================================================

import { SIZE, BLOCKED, OBSIDIAN, collapseAndFill } from './board.js';

/**
 * Picks a random on-board cell to turn into an Obsidian gem, excluding
 * BLOCKED cells, cells that are already Obsidian (nothing gained by
 * re-targeting one), and any cell in `excludedKeys` — normally the
 * set of cells already mid-match/about to clear this cascade step, so
 * an Obsidian never spawns on top of something that's simultaneously
 * being scored and removed.
 *
 * @param {number[][]} grid
 * @param {Set<string>} [excludedKeys] - `"row,col"` keys to skip.
 * @returns {[number, number] | null} the chosen cell, or null if
 *   somehow nothing on the board qualified (shouldn't normally happen).
 */
export function pickObsidianTargetCell(grid, excludedKeys = new Set()) {
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === BLOCKED) continue;
      if (grid[r][c] === OBSIDIAN) continue;
      if (excludedKeys.has(`${r},${c}`)) continue;
      candidates.push([r, c]);
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * "Falls off the board" cleanup — call this once, right after
 * collapseAndFill() has already run for this cascade step (same call
 * site, immediately after). Repeatedly checks every column's actual
 * bottom-most non-BLOCKED cell (which is NOT always row SIZE-1 — a
 * shrunk or not-yet-expanded board can have BLOCKED cells at the very
 * bottom of a column, so "the last row" means "the lowest cell this
 * column actually has", not a fixed row index); if that cell holds an
 * Obsidian gem, it's removed (marked -1, same transient marker a
 * normal match uses) and everything above it re-settles via another
 * collapseAndFill() pass.
 *
 * This can cascade: removing one Obsidian can drop a SECOND Obsidian
 * into the new bottom slot of the same column, so the whole scan
 * repeats until a full pass finds nothing left to remove.
 *
 * @param {number[][]} grid - mutated in place.
 * @param {any[][][]} [parallelGrids] - forwarded straight through to
 *   collapseAndFill() on every re-settle pass (e.g. specialGemState.grid),
 *   so nothing rides along incorrectly while Obsidian keeps dropping off.
 * @returns {boolean} true if at least one Obsidian gem fell off the board.
 */
export function settleObsidianOffBoard(grid, parallelGrids = []) {
  let removedAny = false;
  let keepChecking = true;

  while (keepChecking) {
    keepChecking = false;

    for (let c = 0; c < SIZE; c++) {
      // Walk this column from the very bottom row upward until we hit
      // the first non-BLOCKED cell — THAT is "the last row" for this
      // specific column, whatever the board's current shape is.
      let bottomRow = -1;
      for (let r = SIZE - 1; r >= 0; r--) {
        if (grid[r][c] !== BLOCKED) { bottomRow = r; break; }
      }
      if (bottomRow === -1) continue; // this whole column is blocked — nothing to check

      if (grid[bottomRow][c] === OBSIDIAN) {
        // Mark it as a transient clear (-1), exactly like a normal
        // match would — collapseAndFill() below will drop everything
        // above it down into the gap and spawn a fresh gem up top.
        grid[bottomRow][c] = -1;
        removedAny = true;
        keepChecking = true; // something new just landed at this column's bottom — check it too
      }
    }

    if (keepChecking) {
      collapseAndFill(grid, parallelGrids);
    }
  }

  return removedAny;
}