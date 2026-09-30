// ============================================================
// CONSUMABLE.JS (gameplay) — inventory management + the board-
// mutation EFFECTS of Pickaxe/Dynamite/Dice.
//
// CHANGED THIS ROUND — triggerRandomHyperstarWipe() used to be defined
// locally in this file. It's now defined in special_gem.js instead
// (that file's own chain-reaction BFS needed the exact same function,
// and special_gem.js can't import FROM this file without creating a
// cycle, since this file already imports FROM special_gem.js) — so
// this file just imports it from there now, same single source of
// truth, zero behavior change.
// ============================================================

import { SIZE, BLOCKED, OBSIDIAN, GEM_TYPES_TOTAL, rand, swap } from './board.js';
import {
  laserRowBlastCells, laserColBlastCells, dischargerBlastCells,
  triggerRandomHyperstarWipe,
  isDestroyable, // NEW — shared "can this cell be destroyed?" rule (excludes Obsidian)
} from './special_gem.js';
import { CONSUMABLE_BELT_SIZE } from '../resources/consumable/consumable.js';
import { consumableState } from '../resources/consumable/consumable_state.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';
import { SPECIAL_GEM_TYPE } from '../resources/special%20gem/special_gem.js';

let nextConsumablePickId = 1;

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

// ============================================================
// INVENTORY (belt) BOOKKEEPING
// ============================================================

/** Whether the belt currently has room for one more item. */
export function hasBeltSpace() {
  return consumableState.inventory.length < CONSUMABLE_BELT_SIZE;
}

/**
 * Adds one consumable to the belt.
 *
 * @param {string} type - a CONSUMABLE_TYPE value.
 * @returns {object} the new inventory entry.
 */
export function addConsumableToInventory(type) {
  const entry = { pickId: nextConsumablePickId++, type };
  consumableState.inventory.push(entry);
  return entry;
}

/**
 * Removes one specific consumable from the belt by its pickId.
 *
 * @param {number} pickId
 * @returns {object|null}
 */
export function removeConsumableFromInventory(pickId) {
  const index = consumableState.inventory.findIndex(e => e.pickId === pickId);
  if (index === -1) return null;
  const [removed] = consumableState.inventory.splice(index, 1);
  return removed;
}

/**
 * The first held inventory entry of a given type, if any.
 *
 * @param {string} type
 * @returns {object|null}
 */
export function findFirstConsumableOfType(type) {
  return consumableState.inventory.find(e => e.type === type) || null;
}

/** Clears the belt for a fresh run. Call from main.js's init(). */
export function resetConsumables() {
  consumableState.inventory.length = 0;
  nextConsumablePickId = 1;
}

// ============================================================
// EFFECTS — Pickaxe / Dynamite / Dice
// ============================================================

/**
 * Expands an initial set of consumable-targeted cells into everything
 * that ACTUALLY gets cleared once chain reactions are accounted for.
 *
 * @param {number[][]} grid
 * @param {[number, number][]} initialCells
 * @returns {[number, number][]}
 */
function expandConsumableBlast(grid, initialCells) {
  const cleared = new Set(initialCells.map(([r, c]) => `${r},${c}`));
  const queue = [...cleared];
  const processed = new Set();

  while (queue.length) {
    const key = queue.pop();
    if (processed.has(key)) continue;
    processed.add(key);

    const [r, c] = key.split(',').map(Number);
    const specialType = specialGemState.grid[r][c];
    if (!specialType) continue;

    if (specialType === SPECIAL_GEM_TYPE.HYPERSTAR) {
      // Fold the random wipe's cells into the SAME cleared set so
      // everything scores and cascades together as one activation.
      triggerRandomHyperstarWipe(grid).forEach(([wr, wc]) => {
        const wKey = `${wr},${wc}`;
        if (!cleared.has(wKey)) {
          cleared.add(wKey);
          queue.push(wKey);
        }
      });
      continue;
    }

    const blast = specialType === SPECIAL_GEM_TYPE.LASER_ROW ? laserRowBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.LASER_COL ? laserColBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.DISCHARGER ? dischargerBlastCells(r, c)
      : [];

    for (const [br, bc] of blast) {
      // A chain-reaction blast from a consumable never destroys Obsidian either.
      if (!isDestroyable(grid, br, bc)) continue;
      const bKey = `${br},${bc}`;
      if (!cleared.has(bKey)) {
        cleared.add(bKey);
        queue.push(bKey);
      }
    }
  }

  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * Pickaxe: destroys exactly one targeted cell.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]}
 */
export function triggerPickaxe(grid, row, col) {
  // Nothing to destroy on off-board, blocked, or Obsidian cells.
  if (!isDestroyable(grid, row, col)) return [];
  return expandConsumableBlast(grid, [[row, col]]);
}

/**
 * Dynamite: destroys a 3x3 area centered on the targeted cell.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]}
 */
export function triggerDynamite(grid, row, col) {
  const initial = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc;
      // The 3x3 area simply skips any Obsidian caught inside it.
      if (isDestroyable(grid, r, c)) initial.push([r, c]);
    }
  }
  return expandConsumableBlast(grid, initial);
}

/**
 * Dice: shuffles only a 3x3 area centered on the target click (same
 * footprint/edge-clipping as Dynamite). Fisher-Yates shuffle of just
 * that area's CURRENT colors — specialGemState is untouched, and
 * Obsidian cells are excluded from the shuffle pool entirely.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {void}
 */
export function triggerDiceShuffleArea(grid, row, col) {
  const positions = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc;
      // Same "clip, don't reject" edge handling as Dynamite: a cell
      // outside the board, BLOCKED, or Obsidian is just skipped.
      if (inBounds(r, c) && grid[r][c] !== BLOCKED && grid[r][c] !== OBSIDIAN) {
        positions.push([r, c]);
      }
    }
  }

  // Fisher-Yates shuffle of just these cells' colors among themselves.
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const [r1, c1] = positions[i];
    const [r2, c2] = positions[j];
    const tmp = grid[r1][c1];
    grid[r1][c1] = grid[r2][c2];
    grid[r2][c2] = tmp;
  }
}

/**
 * Magical Glove: swaps ANY two usable cells on the board, adjacent or
 * not. Both the gem colors AND their special-gem overlays move
 * together, so a Laser stays a Laser at its new position.
 *
 * This does NOT run any swap-combo logic (Hyperstar wipe, Laser combo,
 * etc.). It only repositions. main.js then runs the normal match
 * pipeline, so any color match the move creates resolves as usual.
 *
 * @param {number[][]} grid - mutated in place.
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @returns {boolean} true if the swap happened, false if it was rejected.
 */
export function triggerMagicalGloveSwap(grid, row1, col1, row2, col2) {
  // Both cells must be inside the allocated grid.
  if (!inBounds(row1, col1) || !inBounds(row2, col2)) return false;

  // Swapping a cell with itself is meaningless.
  if (row1 === row2 && col1 === col2) return false;

  // BLOCKED (null) and Obsidian cells can never be either end.
  const unusable = (r, c) => grid[r][c] === BLOCKED || grid[r][c] === OBSIDIAN;
  if (unusable(row1, col1) || unusable(row2, col2)) return false;

  // Swap the colors...
  swap(grid, row1, col1, row2, col2);
  // ...and the special-gem overlay, so specials travel with their gem.
  swap(specialGemState.grid, row1, col1, row2, col2);

  return true;
}