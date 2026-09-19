// ============================================================
// SPECIAL_GEM.JS — special gem spawning + activation logic.
//
// Reads/writes specialGemState (resources/specialGem/) but owns none
// of it — same split as boon.js/shop.js/tiles.js. The one thing this
// module does that those don't: it reads the live `grid` (gem types)
// to classify match shapes and to run a Hyperstar's swap-activated
// effects. The normal-match path never mutates `grid` itself — main.js
// still owns clearing cells to -1 and calling collapseAndFill(). The
// Hyperstar+Laser combo IS a deliberate exception to the "read-only"
// half of that rule: it writes into specialGemState.grid directly
// (see triggerHyperstarLaserCombo()), since "convert these cells into
// lasers" is itself part of that combo's effect, not a decision
// main.js makes afterward.
// ============================================================

import { SIZE, BLOCKED } from './board.js';
import { SPECIAL_GEM_TYPE } from '../resources/special%20gem/special_gem.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';

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

/** Every cell a Row Laser clears in addition to itself: its full row. */
function laserRowBlastCells(row, col) {
  const cells = [];
  for (let c = 0; c < SIZE; c++) cells.push([row, c]);
  return cells;
}

/** Every cell a Column Laser clears in addition to itself: its full column. */
function laserColBlastCells(row, col) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) cells.push([r, col]);
  return cells;
}

/** Every cell a Star gem clears in addition to itself: row + column + both diagonals. Unchanged from before — still built out of the two laser blast shapes plus diagonals. */
function starBlastCells(row, col) {
  const cells = [...laserRowBlastCells(row, col), ...laserColBlastCells(row, col)];
  for (let d = -SIZE; d <= SIZE; d++) {
    if (d === 0) continue;
    if (inBounds(row + d, col + d)) cells.push([row + d, col + d]);
    if (inBounds(row + d, col - d)) cells.push([row + d, col - d]);
  }
  return cells;
}

/**
 * Decides whether a matched group should spawn a special gem, and
 * where.
 *
 * REWORKED THIS ROUND: a straight-line group of exactly 4 used to
 * always spawn a Flame; now it spawns a directional Laser instead —
 * Row if the run lies along a single row (horizontal), Column if it
 * lies along a single column (vertical). A straight-line group of 5+
 * still spawns a Hyperspace Star (renamed from Hypercube — same
 * trigger condition, very different activation behavior, see
 * main.js). A non-straight group of 4+ (an L or T shape) is
 * unchanged: still spawns a Star. Plain 3-matches still spawn
 * nothing.
 *
 * @param {{gemType: number, cells: [number, number][]}} group
 * @returns {{type: string, row: number, col: number} | null}
 */
function classifyGroup(group) {
  const { cells } = group;
  if (cells.length < 4) return null;

  const straight = isStraightLine(cells);

  if (straight) {
    // A straight run's cells all share either the same row (a
    // horizontal run) or the same column (a vertical run) — check
    // which, so a 4-match spawns the RIGHT direction of laser.
    const isHorizontalRun = cells.every(([r]) => r === cells[0][0]);
    const [row, col] = middleCell(cells);

    if (cells.length === 4) {
      return {
        type: isHorizontalRun ? SPECIAL_GEM_TYPE.LASER_ROW : SPECIAL_GEM_TYPE.LASER_COL,
        row,
        col,
      };
    }
    // length >= 5 here, straight line either way — always a Hyperstar
    // regardless of orientation, since it isn't a directional gem.
    return { type: SPECIAL_GEM_TYPE.HYPERSTAR, row, col };
  }

  // Non-straight (L/T shape) group of 4+ — completely unchanged.
  const [row, col] = intersectionCell(cells);
  return { type: SPECIAL_GEM_TYPE.STAR, row, col };
}

/**
 * Resolves one round of matches: spawn decisions, chain-reaction
 * expansion, and a scoring breakdown — which cleared cells came from
 * a formed match (matchedGroups) vs. a chain-reaction blast
 * (incidentalCells) — so score.js can score them differently.
 *
 * @param {number[][]} grid
 * @param {boolean[][]} matched
 * @returns {{
 *   clearedCells: [number, number][],
 *   spawns: {type: string, row: number, col: number}[],
 *   matchedGroups: { gemType: number, length: number }[],
 *   incidentalCells: { gemType: number, row: number, col: number }[],
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

  // snapshot BEFORE blast expansion — everything in here was part of
  // a formed match this pass; scoring uses this to spot incidental cells
  const originalMatchedKeys = new Set(clearedKeys);

  const spawns = [];
  const spawnKeys = new Set();
  for (const group of groups) {
    const spawn = classifyGroup(group);
    if (!spawn) continue;
    const key = `${spawn.row},${spawn.col}`;
    if (spawnKeys.has(key)) continue;
    spawns.push(spawn);
    spawnKeys.add(key);
  }

  const queue = [...clearedKeys];
  const processed = new Set();
  while (queue.length) {
    const key = queue.pop();
    if (processed.has(key)) continue;
    processed.add(key);

    const [r, c] = key.split(',').map(Number);
    const specialType = specialGemState.grid[r][c];
    if (!specialType) continue;

    // Dispatch on which special sits here. Hyperstar deliberately has
    // no case — it's swap-activated only (see main.js's attemptSwap)
    // and never blasts as part of a normal chain reaction, same as
    // the old Hypercube behavior.
    const blast = specialType === SPECIAL_GEM_TYPE.LASER_ROW ? laserRowBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.LASER_COL ? laserColBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.STAR ? starBlastCells(r, c)
      : [];

    for (const [br, bc] of blast) {
      if (!inBounds(br, bc) || grid[br][bc] == null) continue;
      const bKey = `${br},${bc}`;
      if (!clearedKeys.has(bKey)) {
        clearedKeys.add(bKey);
        queue.push(bKey);
      }
    }
  }

  for (const key of spawnKeys) clearedKeys.delete(key);

  const clearedCells = [...clearedKeys].map(key => key.split(',').map(Number));

  // scoring breakdown — group length uses the ORIGINAL match size (a
  // match-4 still scores as 4 even though one cell survives as a spawn)
  const matchedGroups = groups.map(g => ({ gemType: g.gemType, length: g.cells.length }));
  const incidentalCells = [...clearedKeys]
    .filter(key => !originalMatchedKeys.has(key))
    .map(key => {
      const [r, c] = key.split(',').map(Number);
      return { gemType: grid[r][c], row: r, col: c };
    });

  return { clearedCells, spawns, matchedGroups, incidentalCells };
}

/**
 * Hyperstar + normal (or Star) gem swap — the classic same-color
 * wipe. Renamed from the old triggerHypercube(); behavior itself is
 * UNCHANGED: clears every gem on the board matching `targetGemType`,
 * plus the Hyperstar's own cell.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow - row the Hyperstar ended up at after the swap.
 * @param {number} hyperCol - column the Hyperstar ended up at after the swap.
 * @param {number} targetGemType - gem type to wipe from the board.
 * @returns {[number, number][]} every cell cleared.
 */
export function triggerHyperstarSingle(grid, hyperRow, hyperCol, targetGemType) {
  const cleared = [[hyperRow, hyperCol]];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === targetGemType) cleared.push([r, c]);
    }
  }
  return cleared;
}

/**
 * NEW — Hyperstar + Laser swap: "convert and detonate," mirroring
 * Bejeweled's Hypercube-plus-special interaction. Every board cell
 * whose underlying color matches the swapped-with laser's color gets
 * converted into a laser gem itself — orientation (row or column)
 * rolled independently per cell, per the design ask ("random"). Every
 * one of those freshly-converted lasers then immediately detonates.
 *
 * Mutates specialGemState.grid directly during the conversion step —
 * this is the one documented exception to this module's usual
 * "read grid, don't write it" split (see file header comment).
 * main.js's clearSpecialGems() wipes all of it again moments later
 * once these cells get cleared to -1, so nothing lingers on screen.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow - row the Hyperstar ended up at after the swap.
 * @param {number} hyperCol - column the Hyperstar ended up at after the swap.
 * @param {number} targetGemType - underlying color of the laser gem swapped with.
 * @returns {[number, number][]} every cell cleared (Hyperstar's own cell + every converted laser's blast).
 */
export function triggerHyperstarLaserCombo(grid, hyperRow, hyperCol, targetGemType) {
  const cleared = new Set([`${hyperRow},${hyperCol}`]);

  // Step 1 — find every matching-color cell on the board and convert
  // it into a laser. Collected into a list first (rather than
  // detonating inline) so step 2 always detonates the FULL converted
  // set, not a partial one affected by earlier detonations altering
  // the board mid-loop.
  const convertedLasers = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== targetGemType) continue;
      const orientation = Math.random() < 0.5 ? SPECIAL_GEM_TYPE.LASER_ROW : SPECIAL_GEM_TYPE.LASER_COL;
      specialGemState.grid[r][c] = orientation;
      convertedLasers.push({ row: r, col: c, orientation });
    }
  }

  // Step 2 — detonate every laser just created. Each one blasts its
  // own row or column depending on the orientation it happened to
  // roll, exactly like a normally-matched laser of that type would.
  convertedLasers.forEach(({ row, col, orientation }) => {
    cleared.add(`${row},${col}`);
    const blast = orientation === SPECIAL_GEM_TYPE.LASER_ROW
      ? laserRowBlastCells(row, col)
      : laserColBlastCells(row, col);
    blast.forEach(([br, bc]) => {
      if (inBounds(br, bc) && grid[br][bc] != null) cleared.add(`${br},${bc}`);
    });
  });

  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * NEW — Hyperstar + Hyperstar swap: clears the entire board.
 *
 * @param {number[][]} grid
 * @returns {[number, number][]} every currently-usable (non-BLOCKED) cell on the board.
 */
export function triggerHyperstarDouble(grid) {
  const cleared = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] != null) cleared.push([r, c]);
    }
  }
  return cleared;
}

/**
 * NEW — Laser + Laser swap combo: clears the full row AND full
 * column through the swap's DESTINATION cell (row, col) — regardless
 * of which two orientations (row/row, row/col, col/col) were
 * actually involved. Since a swap can only ever happen between
 * orthogonally-adjacent cells, the OTHER laser's own cell is always
 * automatically included in one of these two lines — no separate
 * handling needed for it.
 *
 * @param {number[][]} grid
 * @param {number} row - destination row (main.js passes r2/c2 here — see attemptSwap).
 * @param {number} col - destination col.
 * @returns {[number, number][]}
 */
export function triggerLaserCombo(grid, row, col) {
  const cleared = new Set();
  [...laserRowBlastCells(row, col), ...laserColBlastCells(row, col)].forEach(([r, c]) => {
    if (inBounds(r, c) && grid[r][c] != null) cleared.add(`${r},${c}`);
  });
  return [...cleared].map(key => key.split(',').map(Number));
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