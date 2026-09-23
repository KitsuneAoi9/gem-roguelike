// ============================================================
// SPECIAL_GEM.JS — special gem spawning + activation logic.
//
// Reads/writes specialGemState (resources/specialGem/) but owns none
// of it — same split as boon.js/shop.js/tiles.js. The one thing this
// module does that those don't: it reads the live `grid` (gem types)
// to classify match shapes and to run swap-activated combos. The
// normal-match path never mutates `grid` itself — main.js still owns
// clearing cells to -1 and calling collapseAndFill(). The convert-
// and-detonate combos (Hyperstar+Laser, Hyperstar+Discharger) ARE a
// deliberate exception to the "read-only" half of that rule: they
// write into specialGemState.grid directly during the conversion
// step, since "convert these cells" is itself part of the effect.
//
// RENAMED/REWORKED THIS ROUND — Star -> Discharger (see the resource
// file's header for the full behavior rundown). Mechanically:
//   - dischargerBlastCells() is NEW — a diamond-shaped blast (every
//     cell within Manhattan distance 2 of itself — |dRow|+|dCol| <= 2)
//     used when a Discharger is cleared via a normal match or a
//     chain-reaction (resolveSpecialGems()'s dispatch below).
//   - radialBurstCells() is the OLD starBlastCells() renamed — same
//     row+column+diagonals shape, just no longer the passive on-match
//     effect. Now only used by triggerDischargerDouble() below.
//   - triggerDischargerDouble(), triggerDischargerLaserCombo(), and
//     triggerHyperstarDischargerCombo() are NEW — the three
//     Discharger-involving swap combos.
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

/**
 * Every cell the OLD Star-Gem-style burst clears in addition to
 * itself: row + column + both diagonals. RENAMED from starBlastCells()
 * — this shape itself is unchanged, it's just no longer a Discharger's
 * passive on-match effect (see dischargerBlastCells() below for that).
 * Now used ONLY by triggerDischargerDouble() — the Discharger+
 * Discharger swap combo.
 */
function radialBurstCells(row, col) {
  const cells = [...laserRowBlastCells(row, col), ...laserColBlastCells(row, col)];
  for (let d = -SIZE; d <= SIZE; d++) {
    if (d === 0) continue;
    if (inBounds(row + d, col + d)) cells.push([row + d, col + d]);
    if (inBounds(row + d, col - d)) cells.push([row + d, col - d]);
  }
  return cells;
}

/**
 * NEW — every cell a Discharger clears in addition to itself: a
 * DIAMOND shape (every cell within Manhattan distance 2 — i.e.
 * |dRow| + |dCol| <= 2), not the old plain 3x3 square. Drawn out,
 * it looks like:
 *
 *     X
 *   X X X
 * X X X X X
 *   X X X
 *     X
 *
 * This is the Discharger's PASSIVE on-match effect (a normal match,
 * or a chain-reaction blast, hitting its cell) — see
 * resolveSpecialGems()'s dispatch below. Also reused as-is by
 * triggerHyperstarDischargerCombo() below (each converted-and-
 * detonated Discharger uses this exact same shape), so there's still
 * only ONE place that defines "what a Discharger's blast looks like."
 *
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]}
 */
function dischargerBlastCells(row, col) {
  const cells = [];
  // Walk the diamond's 5x5 bounding box, then drop anything outside
  // Manhattan distance 2 — simpler than hand-listing each of the 12
  // ring cells individually, and the radius is a one-number tweak
  // here if the design ever wants a bigger/smaller diamond later.
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (dr === 0 && dc === 0) continue; // itself — the caller clears that separately
      if (Math.abs(dr) + Math.abs(dc) > 2) continue; // outside the diamond's radius — skip
      if (inBounds(row + dr, col + dc)) cells.push([row + dr, col + dc]);
    }
  }
  return cells;
}

/**
 * NEW — picks which cell within a matched group a spawned special
 * gem should appear at, preferring one of the two cells the player
 * just swapped over the old fixed middle/intersection rule.
 *
 * If BOTH swapped cells land inside the SAME group (one swap can
 * simultaneously complete two intersecting runs), the DESTINATION
 * cell (`to`) wins — "where the gem the player moved actually ended
 * up" reads as the more natural spawn point than where it came from.
 * If only one swapped cell is in this group, that one is used
 * regardless of which side it was. If NEITHER swapped cell is in
 * this group — a cascade step with no swap at all, which is the
 * common case for every link after the first — this falls back to
 * `fallbackFn`, exactly like every prior round's behavior.
 *
 * @param {[number, number][]} cells - the matched group's cells.
 * @param {[[number, number], [number, number]] | null} swapCells -
 *   `[[fromRow, fromCol], [toRow, toCol]]`, or null if this step has
 *   no associated swap.
 * @param {(cells: [number, number][]) => [number, number]} fallbackFn -
 *   `middleCell` for a straight run, `intersectionCell` for an L/T
 *   shape — whichever the caller already uses for that shape.
 * @returns {[number, number]}
 */
function pickSpawnCell(cells, swapCells, fallbackFn) {
  if (swapCells) {
    const [[fromRow, fromCol], [toRow, toCol]] = swapCells;
    const cellKeys = new Set(cells.map(([r, c]) => `${r},${c}`));
    const toInGroup = cellKeys.has(`${toRow},${toCol}`);
    const fromInGroup = cellKeys.has(`${fromRow},${fromCol}`);

    if (toInGroup) return [toRow, toCol];
    if (fromInGroup) return [fromRow, fromCol];
  }
  // No swap this step, or neither swapped cell ended up in THIS
  // particular group — fall back to the original placement rule.
  return fallbackFn(cells);
}

/**
 * Decides whether a matched group should spawn a special gem, and
 * where.
 *
 * A straight-line group of exactly 4 spawns a directional Laser — Row
 * if the run lies along a single row (horizontal), Column if it lies
 * along a single column (vertical). A straight-line group of 5+
 * spawns a Hyperspace Star. A non-straight group of 4+ (an L or T
 * shape) spawns a Discharger. Plain 3-matches still spawn nothing.
 *
 * NEW — spawn POSITION now prefers wherever the player's swap landed
 * (see pickSpawnCell() above), falling back to the old fixed
 * middle/intersection rule whenever this group has no associated
 * swap (every cascade link past the first).
 *
 * @param {{gemType: number, cells: [number, number][]}} group
 * @param {[[number, number], [number, number]] | null} swapCells
 * @returns {{type: string, row: number, col: number} | null}
 */
function classifyGroup(group, swapCells) {
  const { cells } = group;
  if (cells.length < 4) return null;

  const straight = isStraightLine(cells);

  if (straight) {
    const isHorizontalRun = cells.every(([r]) => r === cells[0][0]);
    const [row, col] = pickSpawnCell(cells, swapCells, middleCell);

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

  // Non-straight (L/T shape) group of 4+ -> Discharger.
  const [row, col] = pickSpawnCell(cells, swapCells, intersectionCell);
  return { type: SPECIAL_GEM_TYPE.DISCHARGER, row, col };
}

/**
 * Resolves one round of matches: spawn decisions, chain-reaction
 * expansion, and a scoring breakdown.
 *
 * @param {number[][]} grid
 * @param {boolean[][]} matched
 * @param {[[number, number], [number, number]] | null} [swapCells] -
 *   passed straight through to classifyGroup() — see its doc comment
 *   and main.js's resolveMatches() for the "only non-null on the
 *   very first post-swap step" rule.
 * @returns {{
 *   clearedCells: [number, number][],
 *   spawns: {type: string, row: number, col: number}[],
 *   matchedGroups: { gemType: number, length: number }[],
 *   incidentalCells: { gemType: number, row: number, col: number }[],
 * }}
 */
export function resolveSpecialGems(grid, matched, swapCells = null) {
  const groups = findMatchGroups(grid, matched);

  const clearedKeys = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (matched[r][c]) clearedKeys.add(`${r},${c}`);
    }
  }

  const originalMatchedKeys = new Set(clearedKeys);

  const spawns = [];
  const spawnKeys = new Set();
  for (const group of groups) {
    const spawn = classifyGroup(group, swapCells); // <-- only this line changed
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
    // and never blasts as part of a normal chain reaction.
    const blast = specialType === SPECIAL_GEM_TYPE.LASER_ROW ? laserRowBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.LASER_COL ? laserColBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.DISCHARGER ? dischargerBlastCells(r, c)
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
 * Hyperstar + normal (or Discharger, now — see file header) swap —
 * the classic same-color wipe. Clears every gem on the board matching
 * `targetGemType`, plus the Hyperstar's own cell.
 *
 * NOTE: as of this round, main.js only routes a swap into this
 * function for a PLAIN normal gem — Discharger now has its own
 * dedicated combo (triggerHyperstarDischargerCombo() below), same as
 * Laser already did.
 *
 * FIXED THIS ROUND — a SECOND Hyperstar sitting on a
 * targetGemType-colored cell used to get swept up and destroyed as
 * "just another same-color gem," since this only ever scanned the
 * plain grid[][] color, never specialGemState. Hyperstar is
 * documented (see file header, Part 4 §24) as swap-activated ONLY —
 * nothing should be able to incidentally destroy one except a real
 * swap targeting it directly (Hyperstar+Hyperstar -> triggerHyperstarDouble()).
 * A same-color wipe fired by a DIFFERENT Hyperstar is exactly the
 * "incidental" destruction that rule exists to prevent.
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
      // Skip the origin Hyperstar's own cell here — it's already
      // pushed above unconditionally, and its underlying grid[][]
      // color could coincidentally equal targetGemType too (e.g.
      // wiping Ruby while the Hyperstar itself happens to sit on a
      // Ruby-colored cell). Don't double-add it.
      if (r === hyperRow && c === hyperCol) continue;

      // NEW — the actual bugfix. If ANOTHER Hyperstar is sitting
      // here, it doesn't matter what color the grid says this cell
      // is: leave it alone entirely. It's not cleared, not scored,
      // not touched in any way by this wipe.
      if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) continue;

      if (grid[r][c] === targetGemType) cleared.push([r, c]);
    }
  }

  return cleared;
}

/**
 * Hyperstar + Laser swap: "convert and detonate." Every board cell
 * whose underlying color matches the swapped-with laser's color gets
 * converted into a laser gem itself (orientation rolled independently
 * per cell), then every one of those freshly-converted lasers
 * immediately detonates.
 *
 * Mutates specialGemState.grid directly during the conversion step —
 * a documented exception to this module's usual "read grid, don't
 * write it" split (see file header comment).
 *
 * FIXED THIS ROUND — same bug/fix as triggerHyperstarSingle() above:
 * this used to convert (and therefore destroy) a second Hyperstar
 * sharing the target color, since the color scan below never checked
 * specialGemState before overwriting it.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow - row the Hyperstar ended up at after the swap.
 * @param {number} hyperCol - column the Hyperstar ended up at after the swap.
 * @param {number} targetGemType - underlying color of the laser gem swapped with.
 * @returns {[number, number][]} every cell cleared.
 */
export function triggerHyperstarLaserCombo(grid, hyperRow, hyperCol, targetGemType) {
  const cleared = new Set([`${hyperRow},${hyperCol}`]);

  const convertedLasers = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== targetGemType) continue;

      // NEW — never convert (and thereby destroy) a second Hyperstar
      // just because it happens to sit on a matching-colored cell.
      // Skip it and move on; it stays exactly as it was.
      if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) continue;

      const orientation = Math.random() < 0.5 ? SPECIAL_GEM_TYPE.LASER_ROW : SPECIAL_GEM_TYPE.LASER_COL;
      specialGemState.grid[r][c] = orientation;
      convertedLasers.push({ row: r, col: c, orientation });
    }
  }

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
 * Hyperstar + Discharger swap: "convert and detonate," the exact same
 * pattern as triggerHyperstarLaserCombo() above, just converting to
 * Dischargers (instead of Lasers) and detonating each with a diamond
 * blast (dischargerBlastCells()) instead of a row/column one.
 *
 * Mutates specialGemState.grid directly during the conversion step —
 * same documented exception as the Laser version.
 *
 * FIXED THIS ROUND — same bug/fix as the two functions above.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow - row the Hyperstar ended up at after the swap.
 * @param {number} hyperCol - column the Hyperstar ended up at after the swap.
 * @param {number} targetGemType - underlying color of the Discharger swapped with.
 * @returns {[number, number][]} every cell cleared.
 */
export function triggerHyperstarDischargerCombo(grid, hyperRow, hyperCol, targetGemType) {
  const cleared = new Set([`${hyperRow},${hyperCol}`]);

  // Step 1 — convert every matching-color cell into a Discharger.
  const convertedDischargers = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== targetGemType) continue;

      // NEW — same Hyperstar-protection fix as the Laser combo above.
      if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) continue;

      specialGemState.grid[r][c] = SPECIAL_GEM_TYPE.DISCHARGER;
      convertedDischargers.push({ row: r, col: c });
    }
  }

  // Step 2 — detonate every Discharger just created: each clears its
  // own diamond area, exactly like a normally-matched Discharger would.
  convertedDischargers.forEach(({ row, col }) => {
    cleared.add(`${row},${col}`);
    dischargerBlastCells(row, col).forEach(([br, bc]) => {
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
 * Laser + Laser swap combo: clears the full row AND full column
 * through the swap's DESTINATION cell (row, col) — regardless of
 * which two orientations were actually involved. Symmetric (both
 * cells are lasers either way), so unlike the Discharger+Laser combo
 * below, it's safe to just use the swap destination rather than
 * tracking "which side is which."
 *
 * @param {number[][]} grid
 * @param {number} row - destination row (main.js passes r2/c2 here).
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
 * NEW — Discharger + Laser swap combo: clears 3 full rows (if
 * swapped with a LASER_ROW) or 3 full columns (if LASER_COL), instead
 * of the laser's usual single row/column. Centered on `row`/`col` —
 * main.js passes wherever the DISCHARGER itself ended up after the
 * swap (not necessarily the swap destination), since this combo is
 * asymmetric (mirrors how the Hyperstar combos track the acting
 * special gem's landing spot, unlike the symmetric Laser+Laser combo
 * above).
 *
 * Boundary cells past the allocated grid's edge are just skipped
 * (fewer than 3 rows/columns clear near an edge) rather than failing
 * anything — same "clip, don't reject" spirit as tiles.js's
 * expandBoard().
 *
 * @param {number[][]} grid
 * @param {number} row - row the Discharger ended up at.
 * @param {number} col - col the Discharger ended up at.
 * @param {string} laserOrientation - SPECIAL_GEM_TYPE.LASER_ROW or LASER_COL.
 * @returns {[number, number][]}
 */
export function triggerDischargerLaserCombo(grid, row, col, laserOrientation) {
  const cleared = new Set();

  if (laserOrientation === SPECIAL_GEM_TYPE.LASER_ROW) {
    [row - 1, row, row + 1].forEach(r => {
      if (r < 0 || r >= SIZE) return; // off the top/bottom edge — clear fewer than 3 rows
      laserRowBlastCells(r, col).forEach(([rr, cc]) => {
        if (inBounds(rr, cc) && grid[rr][cc] != null) cleared.add(`${rr},${cc}`);
      });
    });
  } else {
    [col - 1, col, col + 1].forEach(c => {
      if (c < 0 || c >= SIZE) return; // off the left/right edge — clear fewer than 3 columns
      laserColBlastCells(row, c).forEach(([rr, cc]) => {
        if (inBounds(rr, cc) && grid[rr][cc] != null) cleared.add(`${rr},${cc}`);
      });
    });
  }

  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * NEW — Discharger + Discharger swap combo: the OLD row+column+
 * diagonals "star burst" (radialBurstCells()), centered on the swap's
 * destination cell. Symmetric (both cells are Dischargers either
 * way), so — like Laser+Laser — it's safe to just use the
 * destination rather than tracking "which side is which."
 *
 * @param {number[][]} grid
 * @param {number} row - destination row (r2 from attemptSwap).
 * @param {number} col - destination col.
 * @returns {[number, number][]}
 */
export function triggerDischargerDouble(grid, row, col) {
  const cleared = new Set();
  radialBurstCells(row, col).forEach(([r, c]) => {
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