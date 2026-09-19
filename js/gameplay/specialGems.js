// ============================================================
// SPECIALGEMS.JS — special gem spawning + activation logic.
//
// Reads/writes specialGemState (resources/specialGem/) but owns none
// of it — same split as boon.js/shop.js/tiles.js. The one thing this
// module does that those don't: it reads the live `grid` (gem types)
// to classify match shapes and to run a Hypercube's board-wide wipe,
// though it never mutates `grid` itself — main.js still owns clearing
// cells to -1 and calling collapseAndFill().
// ============================================================

import { SIZE, BLOCKED } from './board.js';
import { SPECIAL_GEM_TYPE } from '../resources/specialGem/specialGemDefinitions.js';
import { specialGemState } from '../resources/specialGem/specialGemState.js';

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * Flood-fills matched[][], grouping same-type matched cells that
 * touch each other into one group — this is what turns two
 * intersecting runs (a row-run + a column-run sharing a cell) into a
 * single L/T-shaped group instead of two separate 3-matches.
 *
 * @param {number[][]} grid
 * @param {boolean[][]} matched - result of findMatches().
 * @returns {{gemType: number, cells: [number, number][]}[]}
 */
function findMatchGroups(grid, matched) {
  const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const groups = [];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!matched[r][c] || visited[r][c]) continue;

      const gemType = grid[r][c];
      const cells = [];
      const stack = [[r, c]];
      visited[r][c] = true;

      while (stack.length) {
        const [cr, cc] = stack.pop();
        cells.push([cr, cc]);
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = cr + dr, nc = cc + dc;
          if (inBounds(nr, nc) && matched[nr][nc] && !visited[nr][nc] && grid[nr][nc] === gemType) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      groups.push({ gemType, cells });
    }
  }

  return groups;
}

/** True if every cell in the group shares a row, or every cell shares a column. */
function isStraightLine(cells) {
  return cells.every(([r]) => r === cells[0][0]) || cells.every(([, c]) => c === cells[0][1]);
}

/** Middle cell of a group, used as a straight-line special's spawn point. */
function middleCell(cells) {
  const sorted = [...cells].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  return sorted[Math.floor(sorted.length / 2)];
}

/** The cell where a group's horizontal run and vertical run cross — the natural spawn point for an L/T shape. */
function intersectionCell(cells) {
  const cellKeys = new Set(cells.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of cells) {
    const hasHorizontalNeighbor = cellKeys.has(`${r},${c - 1}`) || cellKeys.has(`${r},${c + 1}`);
    const hasVerticalNeighbor = cellKeys.has(`${r - 1},${c}`) || cellKeys.has(`${r + 1},${c}`);
    if (hasHorizontalNeighbor && hasVerticalNeighbor) return [r, c];
  }
  return middleCell(cells); // shouldn't happen for a real L/T, but don't crash if it does
}

/**
 * Decides whether a matched group should spawn a special gem, and
 * where. Mirrors Bejeweled: a straight-line group of exactly 4 spawns
 * a Flame; a straight-line group of 5+ spawns a Hypercube; any
 * non-straight group of 4+ (an L or T shape) spawns a Star. Plain
 * 3-matches spawn nothing.
 *
 * @param {{gemType: number, cells: [number, number][]}} group
 * @returns {{type: string, row: number, col: number} | null}
 */
function classifyGroup(group) {
  const { cells } = group;
  if (cells.length < 4) return null;

  const straight = isStraightLine(cells);

  if (cells.length === 4 && straight) {
    const [row, col] = middleCell(cells);
    return { type: SPECIAL_GEM_TYPE.FLAME, row, col };
  }
  if (straight) {
    const [row, col] = middleCell(cells); // length >= 5 here
    return { type: SPECIAL_GEM_TYPE.HYPERCUBE, row, col };
  }
  const [row, col] = intersectionCell(cells);
  return { type: SPECIAL_GEM_TYPE.STAR, row, col };
}

/** Every cell a Flame gem clears in addition to itself: its full row + column. */
function flameBlastCells(row, col) {
  const cells = [];
  for (let c = 0; c < SIZE; c++) cells.push([row, c]);
  for (let r = 0; r < SIZE; r++) cells.push([r, col]);
  return cells;
}

/** Every cell a Star gem clears in addition to itself: row + column + both diagonals. */
function starBlastCells(row, col) {
  const cells = flameBlastCells(row, col);
  for (let d = -SIZE; d <= SIZE; d++) {
    if (d === 0) continue;
    if (inBounds(row + d, col + d)) cells.push([row + d, col + d]);
    if (inBounds(row + d, col - d)) cells.push([row + d, col - d]);
  }
  return cells;
}

/**
 * Resolves one round of matches: figures out which matched cells
 * spawn a new special gem (reserving that cell instead of clearing
 * it), and chains through any *existing* special gems caught up in
 * the match, expanding the cleared set with each one's blast pattern
 * — a Flame clearing another Flame's row/column can trigger that one
 * too, and so on.
 *
 * Doesn't touch the grid itself — main.js still sets cleared cells to
 * -1 and calls collapseAndFill(); this just says which cells that is,
 * and which cell(s) to leave alone because a special is spawning
 * there instead.
 *
 * @param {number[][]} grid - current grid, read-only here.
 * @param {boolean[][]} matched - result of findMatches() for this pass.
 * @returns {{
 *   clearedCells: [number, number][],
 *   spawns: {type: string, row: number, col: number}[],
 * }}
 */
export function resolveSpecialGems(grid, matched) {
  const groups = findMatchGroups(grid, matched);

  const clearedKeys = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (matched[r][c]) clearedKeys.add(`${r},${c}`);
    }
  }

  const spawns = [];
  const spawnKeys = new Set();
  for (const group of groups) {
    const spawn = classifyGroup(group);
    if (!spawn) continue;
    const key = `${spawn.row},${spawn.col}`;
    if (spawnKeys.has(key)) continue; // two groups picked the same cell — keep the first
    spawns.push(spawn);
    spawnKeys.add(key);
  }

  // Chain through existing special gems caught in this match: each
  // one's blast pattern adds more cells, which can catch *another*
  // existing special, and so on. A queue instead of recursion avoids
  // re-processing the same gem twice.
  const queue = [...clearedKeys];
  const processed = new Set();
  while (queue.length) {
    const key = queue.pop();
    if (processed.has(key)) continue;
    processed.add(key);

    const [r, c] = key.split(',').map(Number);
    const specialType = specialGemState.grid[r][c];
    if (!specialType) continue;

    const blast = specialType === SPECIAL_GEM_TYPE.FLAME ? flameBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.STAR ? starBlastCells(r, c)
      : []; // Hypercube doesn't blast on being matched — see triggerHypercube()

    for (const [br, bc] of blast) {
      if (!inBounds(br, bc) || grid[br][bc] == null) continue; // off-board or BLOCKED
      const bKey = `${br},${bc}`;
      if (!clearedKeys.has(bKey)) {
        clearedKeys.add(bKey);
        queue.push(bKey);
      }
    }
  }

  // Spawn cells survive this pass — pull them back out of the cleared set.
  for (const key of spawnKeys) clearedKeys.delete(key);

  const clearedCells = [...clearedKeys].map(key => key.split(',').map(Number));
  return { clearedCells, spawns };
}

/**
 * Applies a Hypercube's swap-activated ability: clears every gem on
 * the board matching `targetGemType`, plus the Hypercube's own cell.
 * Call right after a swap involving a Hypercube, instead of running
 * the normal match check on that swap.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow - row the Hypercube ended up at after the swap.
 * @param {number} hyperCol - column the Hypercube ended up at after the swap.
 * @param {number} targetGemType - gem type to wipe from the board.
 * @returns {[number, number][]} every cell cleared.
 */
export function triggerHypercube(grid, hyperRow, hyperCol, targetGemType) {
  const cleared = [[hyperRow, hyperCol]];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === targetGemType) cleared.push([r, c]);
    }
  }
  return cleared;
}

/**
 * Writes a batch of spawn decisions into specialGemState.grid. Call
 * right after resolveSpecialGems(), before clearing cells, so a spawn
 * cell's special type is recorded before anything reads it.
 *
 * @param {{type: string, row: number, col: number}[]} spawns
 * @returns {void}
 */
export function applySpawns(spawns) {
  spawns.forEach(({ type, row, col }) => {
    specialGemState.grid[row][col] = type;
  });
}

/**
 * Clears the special-gem overlay at a batch of cells — call with
 * every cell main.js is about to set to -1, so a cleared cell's
 * special flag doesn't linger onto whatever gem falls into that spot.
 *
 * @param {[number, number][]} cells
 * @returns {void}
 */
export function clearSpecialGems(cells) {
  cells.forEach(([r, c]) => { specialGemState.grid[r][c] = null; });
}

/**
 * (Re)builds specialGemState.grid as a fresh SIZE x SIZE grid of
 * nulls. Call from main.js's init() alongside resetBoons()/
 * resetShop()/resetTiles(), and again whenever the board reshuffles
 * (PREVENT_DEADLOCK) — a reshuffle regenerates the whole grid, so any
 * previously-placed specials no longer correspond to real gems.
 *
 * @returns {void}
 */
export function resetSpecialGems() {
  specialGemState.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}