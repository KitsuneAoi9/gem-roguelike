// ============================================================
// CONSUMABLE.JS (gameplay) — inventory management + the board-
// mutation EFFECTS of Pickaxe/Dynamite/Dice. Reads/writes
// consumableState but owns none of the state itself — same split as
// boon.js/tiles.js. Golden Ticket and Resurrection Cross don't touch
// the board at all, so their logic lives directly in main.js instead
// (a turn counter and a deadlock-time auto-consume, respectively) —
// nothing here needs to know about either one.
// ============================================================

import { SIZE, BLOCKED, GEM_TYPES_TOTAL, rand } from './board.js';
import { laserRowBlastCells, laserColBlastCells, dischargerBlastCells } from './special_gem.js';
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
 * Adds one consumable to the belt. The caller (main.js's shop
 * purchase handler) is responsible for checking hasBeltSpace() and
 * deducting score FIRST — this trusts it's being called validly,
 * same "logic file doesn't re-validate what the caller already
 * validated" convention pickBoon()/grantCurse() follow.
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
 * Removes one specific consumable from the belt by its pickId (NOT by
 * type — the player could hold two of the same type in different
 * slots). Call this the moment an active-use consumable is SPENT,
 * whether or not its effect actually did anything useful — a
 * consumable never gets refunded once activated (per design: no
 * discard option either, for now).
 *
 * @param {number} pickId
 * @returns {object|null} the removed entry, or null if not found.
 */
export function removeConsumableFromInventory(pickId) {
  const index = consumableState.inventory.findIndex(e => e.pickId === pickId);
  if (index === -1) return null;
  const [removed] = consumableState.inventory.splice(index, 1);
  return removed;
}

/**
 * The first held inventory entry of a given type, if any — used to
 * auto-consume a Resurrection Cross without main.js needing to know
 * its pickId ahead of time (it only knows "does the player have one").
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
 * Every cell a Hyperspace Star wipe clears when triggered by a
 * consumable rather than a swap — same "clear every gem of one
 * color" rule triggerHyperstarSingle() (special_gem.js) already uses
 * for the swap-activated version, just with the target color picked
 * RANDOMLY here (there's no second swapped-with gem to take the
 * color from). Also skips any OTHER Hyperstar caught in the sweep,
 * for the exact same "Hyperstar is never incidentally destroyed"
 * reason triggerHyperstarSingle() already documents (Part 6).
 *
 * @param {number[][]} grid
 * @returns {[number, number][]} every cell cleared, board-wide.
 */
function triggerRandomHyperstarWipe(grid) {
  const targetGemType = rand(GEM_TYPES_TOTAL);
  const cleared = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) continue;
      if (grid[r][c] === targetGemType) cleared.push([r, c]);
    }
  }
  return cleared;
}

/**
 * Expands an initial set of consumable-targeted cells into everything
 * that ACTUALLY gets cleared once chain reactions are accounted for
 * — mirrors special_gem.js's resolveSpecialGems() BFS, but starting
 * from an arbitrary cell set instead of a formed match. Any Laser/
 * Discharger caught in the set detonates its own blast shape (reusing
 * the exact same functions special_gem.js already exports for this);
 * a Hyperstar caught in the set instead triggers a random-color board
 * wipe — matches "if it hit a star, the star destroys all one random
 * gem type on the board" for BOTH Pickaxe and Dynamite.
 *
 * @param {number[][]} grid
 * @param {[number, number][]} initialCells - the cell(s) the
 *   consumable directly targets (one cell for Pickaxe, a 3x3 block
 *   for Dynamite).
 * @returns {[number, number][]} every cell actually cleared.
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
    if (!specialType) continue; // a plain gem — nothing further to chain

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
      if (!inBounds(br, bc) || grid[br][bc] == null) continue;
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
 * Pickaxe: destroys exactly one targeted cell, then lets
 * expandConsumableBlast() handle whatever chain reaction that
 * triggers if the targeted cell held a special gem.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]} every cell cleared (empty array if
 *   the target was off-board/blocked/already empty).
 */
export function triggerPickaxe(grid, row, col) {
  if (!inBounds(row, col) || grid[row][col] == null) return [];
  return expandConsumableBlast(grid, [[row, col]]);
}

/**
 * Dynamite: destroys a 3x3 area centered on the targeted cell (any
 * cell off the edge of the board or already blocked is just skipped
 * — same "clip, don't reject" spirit as tiles.js's expandBoard()),
 * then lets expandConsumableBlast() handle chain reactions.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]} every cell cleared.
 */
export function triggerDynamite(grid, row, col) {
  const initial = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc;
      if (inBounds(r, c) && grid[r][c] != null) initial.push([r, c]);
    }
  }
  return expandConsumableBlast(grid, initial);
}

/**
 * Dice: shuffles every USABLE cell's underlying grid color among
 * themselves — a real permutation of the CURRENT values (Fisher-
 * Yates), not fresh random re-rolls. The exact multiset of colors on
 * the board is unchanged, just redistributed. specialGemState.grid is
 * left completely untouched: a special gem stays on exactly the cell
 * it was already on — only what color the board now shows underneath
 * it can change (a Laser sitting on Ruby might end up sitting on
 * Diamond after the shuffle; its identity as "a Laser" doesn't move).
 *
 * Mutates `grid` in place. Does NOT check for resulting matches —
 * that's the caller's job (main.js runs the normal resolveMatches()
 * pipeline right after, so any matches the shuffle happens to create
 * cascade and score exactly like any other match would).
 *
 * @param {number[][]} grid
 * @returns {void}
 */
export function triggerDiceShuffle(grid) {
  const positions = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== BLOCKED) positions.push([r, c]);
    }
  }

  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const [r1, c1] = positions[i];
    const [r2, c2] = positions[j];
    const tmp = grid[r1][c1];
    grid[r1][c1] = grid[r2][c2];
    grid[r2][c2] = tmp;
  }
}