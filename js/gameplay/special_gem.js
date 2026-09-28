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
// deliberate exception to the "read-only" half of that rule, and —
// NEW THIS ROUND — so is the Entropy/Luminous/Explosive Shard
// Obsidian spawn below: it writes board.js's OBSIDIAN sentinel
// directly into `grid` as part of resolving this step's matches,
// since "spawn a dead gem somewhere on the board" is itself part of
// what this step's outcome IS, same reasoning the existing convert-
// combos already document.
//
// NEW THIS ROUND:
//   - Entropy/Luminous/Explosive Shard: a plain match-3 (which
//     normally spawns nothing at all — classifyGroup() returns null
//     for any group under 4 cells) now gets an EXTRA, independent
//     roll for a bonus special-gem spawn, plus a separate independent
//     roll for an Obsidian gem spawning elsewhere on the board. See
//     rollShardBonusSpawn()/rollShardObsidianSpawn() below.
//   - Frantic Star: triggerHyperstarSingle() gained an
//     `extraRandomTarget` flag (a normal Hyperstar+plain-gem swap now
//     ALSO wipes one random OTHER gem color when this boon is held),
//     and a brand new triggerHyperstarSelfActivation() for the "5%
//     chance of activating entirely on its own" behavior — see
//     main.js's maybeTriggerFranticStarSelfActivation().
//   - triggerRandomHyperstarWipe() is now DEFINED HERE (moved from
//     gameplay/consumable.js, which now imports it from here instead
//     — this was the ONLY way to reuse it in resolveSpecialGems()'s
//     own chain-reaction BFS without a circular import, since
//     consumable.js already imports FROM this file, never the other
//     way around).
//   - resolveSpecialGems()'s chain-reaction BFS now has a real case
//     for a Hyperstar caught in a Laser/Discharger blast: it fires,
//     wiping one random gem color (reusing the function above) —
//     previously it was just cleared as an ordinary cell with no
//     effect at all (a long-flagged gap, see prior handoffs).
//   - classifyGroup() no longer treats EVERY non-straight 4+ cell
//     group as a Discharger. It now requires a GENUINE single L/T
//     shape (exactly one horizontal run of 3+ crossing exactly one
//     vertical run of 3+, at exactly one shared cell, with every cell
//     accounted for) — see findLTIntersection(). A solid block (e.g.
//     a 3x2 rectangle) or a zigzag (two offset parallel runs) no
//     longer spawns anything at all (pending a dedicated special gem
//     for those shapes later, per design).
//   - convertRandomPlainGemsToSpecial() — NEW, supports the
//     Overcharge Essence boon: picks random currently-plain
//     (non-special, non-BLOCKED, non-Obsidian) cells and converts
//     each into a Laser Beam or Discharger.
// ============================================================

import { SIZE, BLOCKED, OBSIDIAN, rand, GEM_TYPES_TOTAL } from './board.js';
import { SPECIAL_GEM_TYPE } from '../resources/special%20gem/special_gem.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import { pickObsidianTargetCell } from './obsidian.js';

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * True if a cell can be destroyed by a special-gem blast or a
 * consumable: it must be on the board, not BLOCKED (null), and NOT
 * an Obsidian gem. Obsidian is permanent — only gravity (falling off
 * the bottom) or a reshuffle may remove it. Exported so
 * consumable.js reuses the exact same rule (single source of truth).
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isDestroyable(grid, row, col) {
  return inBounds(row, col)          // must be inside the allocated grid
    && grid[row][col] != null        // BLOCKED cells (null) can't be cleared
    && grid[row][col] !== OBSIDIAN;  // Obsidian is immune to blasts
}

/**
 * Expands a set of already-cleared cells into EVERYTHING that ends up
 * cleared once special gems caught inside them fire (chain reaction).
 * Same rules as the passive match path and consumables:
 *   - Laser -> its row/column, Discharger -> its diamond
 *   - Hyperstar -> wipes one random gem color
 *   - Obsidian/blocked cells are never destroyed (isDestroyable)
 *
 * @param {number[][]} grid
 * @param {[number, number][]} initialCells - cells the combo cleared.
 * @param {Set<string>} [skipKeys] - "row,col" keys whose special must
 *   NOT fire again (the swapped gems that already activated).
 * @returns {[number, number][]} every cell cleared, initial included.
 */
export function expandChainReaction(grid, initialCells, skipKeys = new Set()) {
  const cleared = new Set(initialCells.map(([r, c]) => `${r},${c}`));
  const queue = [...cleared];
  const processed = new Set();

  while (queue.length) {
    const key = queue.pop();
    if (processed.has(key)) continue; // each cell is processed once
    processed.add(key);

    // The swapped specials already activated; don't fire them again.
    if (skipKeys.has(key)) continue;

    const [r, c] = key.split(',').map(Number);
    const specialType = specialGemState.grid[r][c];
    if (!specialType) continue; // plain gem, nothing to trigger

    // A Hyperstar caught in the area wipes one random color.
    if (specialType === SPECIAL_GEM_TYPE.HYPERSTAR) {
      triggerRandomHyperstarWipe(grid).forEach(([wr, wc]) => {
        const wKey = `${wr},${wc}`;
        if (!cleared.has(wKey)) { cleared.add(wKey); queue.push(wKey); }
      });
      continue;
    }

    // Lasers/Dischargers add their own blast shape.
    const blast = specialType === SPECIAL_GEM_TYPE.LASER_ROW ? laserRowBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.LASER_COL ? laserColBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.DISCHARGER ? dischargerBlastCells(r, c)
      : [];

    for (const [br, bc] of blast) {
      if (!isDestroyable(grid, br, bc)) continue;
      const bKey = `${br},${bc}`;
      if (!cleared.has(bKey)) { cleared.add(bKey); queue.push(bKey); }
    }
  }

  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * Flood-fills matched[][], grouping same-type matched cells that
 * touch each other into one group.
 *
 * @param {number[][]} grid
 * @param {boolean[][]} matched
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

/**
 * NEW — determines whether a non-straight matched group is a genuine
 * single L/T shape: exactly one contiguous horizontal run (3+ cells,
 * in one row) crossing exactly one contiguous vertical run (3+ cells,
 * in one column) at EXACTLY one shared cell, with every cell in the
 * group accounted for by one run or the other (nothing left over).
 *
 * This is what tells a real L/T corner apart from:
 *   - a solid block (e.g. a 3x2 rectangle) — this has TWO qualifying
 *     vertical runs (one per column), so `verticalRuns.length !== 1`
 *     rejects it.
 *   - a zigzag (two horizontal runs in adjacent rows, offset so they
 *     share a couple of columns) — this has TWO qualifying horizontal
 *     runs, so `horizontalRuns.length !== 1` rejects it.
 *
 * Per design, only a genuine L/T currently spawns anything (a
 * Discharger) — a block/zigzag spawns NOTHING for now, pending a
 * dedicated special gem for those shapes later.
 *
 * @param {[number, number][]} cells
 * @returns {[number, number] | null} the intersection cell if this is
 *   a valid L/T, else null.
 */
function findLTIntersection(cells) {
  const rowMap = new Map(); // row -> cols[]
  const colMap = new Map(); // col -> rows[]
  for (const [r, c] of cells) {
    if (!rowMap.has(r)) rowMap.set(r, []);
    rowMap.get(r).push(c);
    if (!colMap.has(c)) colMap.set(c, []);
    colMap.get(c).push(r);
  }

  const isContiguous = (sortedNums) => {
    for (let i = 1; i < sortedNums.length; i++) {
      if (sortedNums[i] !== sortedNums[i - 1] + 1) return false;
    }
    return true;
  };

  // A row "qualifies" as this group's horizontal run only if EVERY
  // cell the group has in that row forms one unbroken run of 3+.
  const horizontalRuns = [];
  for (const [r, cols] of rowMap) {
    const sorted = [...cols].sort((a, b) => a - b);
    if (sorted.length >= 3 && isContiguous(sorted)) {
      horizontalRuns.push({ row: r, cols: sorted });
    }
  }

  const verticalRuns = [];
  for (const [c, rows] of colMap) {
    const sorted = [...rows].sort((a, b) => a - b);
    if (sorted.length >= 3 && isContiguous(sorted)) {
      verticalRuns.push({ col: c, rows: sorted });
    }
  }

  // A genuine L/T has EXACTLY one qualifying row and EXACTLY one
  // qualifying column — a block or zigzag always produces more than
  // one of at least one kind (see doc comment above).
  if (horizontalRuns.length !== 1 || verticalRuns.length !== 1) return null;

  const hRun = horizontalRuns[0];
  const vRun = verticalRuns[0];

  // The two runs must actually cross — the vertical run's column has
  // to be one of the horizontal run's columns, and vice versa.
  const crosses = hRun.cols.includes(vRun.col) && vRun.rows.includes(hRun.row);
  if (!crosses) return null;

  // Every cell in the ORIGINAL group must be accounted for by one of
  // these two runs — if the group has any extra cell beyond what a
  // simple horizontal+vertical cross explains, it isn't a clean L/T.
  const coveredKeys = new Set();
  hRun.cols.forEach(c => coveredKeys.add(`${hRun.row},${c}`));
  vRun.rows.forEach(r => coveredKeys.add(`${r},${vRun.col}`));

  if (coveredKeys.size !== cells.length) return null;
  for (const [r, c] of cells) {
    if (!coveredKeys.has(`${r},${c}`)) return null;
  }

  return [hRun.row, vRun.col];
}

/** Every cell a Row Laser clears in addition to itself: its full row. */
export function laserRowBlastCells(row, col) {
  const cells = [];
  for (let c = 0; c < SIZE; c++) cells.push([row, c]);
  return cells;
}

/** Every cell a Column Laser clears in addition to itself: its full column. */
export function laserColBlastCells(row, col) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) cells.push([r, col]);
  return cells;
}

/**
 * Every cell the OLD Star-Gem-style burst clears in addition to
 * itself: row + column + both diagonals. Used ONLY by
 * triggerDischargerDouble() — the Discharger+Discharger swap combo.
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
 * Every cell a Discharger clears in addition to itself: a DIAMOND
 * shape (every cell within Manhattan distance 2).
 *
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]}
 */
export function dischargerBlastCells(row, col) {
  const cells = [];
  // Walk the diamond's 5x5 bounding box, then drop anything outside
  // Manhattan distance 2 — simpler than hand-listing each of the 12
  // ring cells individually, and the radius is a one-number tweak
  // here if the design ever wants a bigger/smaller diamond later.
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (Math.abs(dr) + Math.abs(dc) > 2) continue;
      if (inBounds(row + dr, col + dc)) cells.push([row + dr, col + dc]);
    }
  }
  return cells;
}

/**
 * Picks which cell within a matched group a spawned special gem
 * should appear at, preferring one of the two cells the player just
 * swapped over the old fixed middle/intersection rule.
 *
 * @param {[number, number][]} cells - the matched group's cells.
 * @param {[[number, number], [number, number]] | null} swapCells
 * @param {(cells: [number, number][]) => [number, number]} fallbackFn
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
 * CHANGED THIS ROUND — the non-straight branch now requires a
 * genuine L/T shape (findLTIntersection()) instead of accepting ANY
 * non-straight 4+ cell group.
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
    return { type: SPECIAL_GEM_TYPE.HYPERSTAR, row, col };
  }

  // CHANGED — only a genuine single L/T shape spawns a Discharger now.
  // A block/zigzag (findLTIntersection() returns null for those)
  // spawns nothing at all, per design.
  const intersection = findLTIntersection(cells);
  if (!intersection) return null;

  const [row, col] = pickSpawnCell(cells, swapCells, () => intersection);
  return { type: SPECIAL_GEM_TYPE.DISCHARGER, row, col };
}

/**
 * Entropy/Luminous/Explosive Shard's bonus spawn roll for a plain
 * plain match-3 group (classifyGroup() above always returns null for
 * these). Checked in a FIXED order — Entropy (Hyperstar) first,
 * Luminous (Laser) second, Explosive (Discharger) last — since a
 * length-3 group only has ONE spawn cell to give away, so only the
 * first type that hits actually fires; the others are never even
 * rolled for this same group once one succeeds.
 *
 * Each shard boon's OWN pick count scales its OWN chance additively
 * (10% per copy, up to 2 copies = 20%) — a player holding two
 * DIFFERENT shard boons rolls each one's own chance independently,
 * in the fixed order above.
 *
 * @param {{gemType: number, cells: [number, number][]}} group
 * @param {[[number, number], [number, number]] | null} swapCells
 * @returns {{type: string, row: number, col: number} | null}
 */
function rollShardBonusSpawn(group, swapCells) {
  const { cells } = group;
  const isHorizontalRun = cells.every(([r]) => r === cells[0][0]);
  const [row, col] = pickSpawnCell(cells, swapCells, middleCell);
  const picks = boonEffectState.shardPicks;

  if (picks.entropy > 0 && Math.random() < 0.10 * picks.entropy) {
    return { type: SPECIAL_GEM_TYPE.HYPERSTAR, row, col };
  }
  if (picks.luminous > 0 && Math.random() < 0.10 * picks.luminous) {
    return { type: isHorizontalRun ? SPECIAL_GEM_TYPE.LASER_ROW : SPECIAL_GEM_TYPE.LASER_COL, row, col };
  }
  if (picks.explosive > 0 && Math.random() < 0.10 * picks.explosive) {
    return { type: SPECIAL_GEM_TYPE.DISCHARGER, row, col };
  }
  return null;
}

/**
 * Entropy/Luminous/Explosive Shard's INDEPENDENT "also spawn an
 * Obsidian gem" roll for a plain match-3 group. Independent from
 * rollShardBonusSpawn() above — a match-3 can spawn BOTH a bonus
 * special AND an Obsidian gem in the same step, since these are two
 * separate rolls. Documented simplification: unlike the bonus-spawn
 * roll (fixed priority order, only one type actually fires), this
 * roll sums ALL currently-held shard boons' pick counts together into
 * one combined chance, rather than rolling each shard type separately
 * — simpler, and there's only ever at most one Obsidian spawn per
 * cascade step anyway (see the `if (!obsidianSpawn)` guard in
 * resolveSpecialGems() below).
 *
 * @param {{gemType: number, cells: [number, number][]}} group
 * @param {number[][]} grid
 * @param {Set<string>} clearedKeys - this step's currently-matched
 *   cells, so an Obsidian never spawns on top of something also being
 *   cleared/scored this same step.
 * @returns {[number, number] | null}
 */
function rollShardObsidianSpawn(group, grid, clearedKeys) {
  if (group.cells.length !== 3) return null;

  const picks = boonEffectState.shardPicks;
  const totalChance = 0.10 * (picks.entropy + picks.luminous + picks.explosive);
  if (totalChance <= 0 || Math.random() >= totalChance) return null;

  return pickObsidianTargetCell(grid, clearedKeys);
}

/**
 * Every cell a Hyperstar wipe clears when there's no swap partner to
 * take a color from at all — the color is picked RANDOMLY instead.
 * Shared by THREE call sites: a consumable's chain reaction hitting a
 * Hyperstar (gameplay/consumable.js), a NORMAL match/blast chain
 * reaction hitting a Hyperstar (resolveSpecialGems() below — this is
 * the case that was previously missing entirely, per a long-flagged
 * gap), and it's conceptually the same random-color logic Frantic
 * Star's self-activation builds on top of (though that one wipes TWO
 * colors — see triggerHyperstarSelfActivation()).
 *
 * Never incidentally destroys a DIFFERENT Hyperstar caught in the
 * same wipe, same protection every other Hyperstar function in this
 * file already has.
 *
 * @param {number[][]} grid
 * @returns {[number, number][]} every cell cleared (does NOT include
 *   the origin Hyperstar's own cell — each caller adds that itself,
 *   since each already knows which cell that is in its own context).
 */
export function triggerRandomHyperstarWipe(grid) {
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
 * Resolves one round of matches: spawn decisions, chain-reaction
 * expansion, and a scoring breakdown.
 *
 * CHANGED THIS ROUND — the chain-reaction BFS below now has a real
 * case for `specialType === HYPERSTAR`: it fires
 * triggerRandomHyperstarWipe() and folds the results into the same
 * cleared set, instead of silently doing nothing (see file header).
 *
 * @param {number[][]} grid
 * @param {boolean[][]} matched
 * @param {[[number, number], [number, number]] | null} [swapCells]
 * @returns {{
 *   clearedCells: [number, number][],
 *   spawns: {type: string, row: number, col: number}[],
 *   matchedGroups: { gemType: number, length: number }[],
 *   incidentalCells: { gemType: number, row: number, col: number }[],
 *   obsidianSpawn: [number, number] | null,
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
  let obsidianSpawn = null; // at most one Obsidian spawn per cascade step

  for (const group of groups) {
    let spawn = classifyGroup(group, swapCells);

    // NEW — Entropy/Luminous/Explosive Shard: give a plain match-3
    // (classifyGroup() returned null since it's under 4 cells) a
    // second chance to spawn a special gem anyway.
    if (!spawn && group.cells.length === 3) {
      spawn = rollShardBonusSpawn(group, swapCells);
    }

    // NEW — independently, roll this same group for an Obsidian
    // spawn too. Only the FIRST group in this step to succeed
    // actually places one (see the guard below) — a single cascade
    // step never spawns more than one Obsidian gem at once.
    if (!obsidianSpawn) {
      obsidianSpawn = rollShardObsidianSpawn(group, grid, clearedKeys);
    }

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

    // CHANGED — a Hyperstar caught in a chain-reaction blast now
    // actually fires: wipe one random gem color from the board,
    // reusing the EXACT same function consumable.js's chain reactions
    // already use, so there's still only one place that defines "what
    // does an unprompted random Hyperstar wipe clear."
    if (specialType === SPECIAL_GEM_TYPE.HYPERSTAR) {
      triggerRandomHyperstarWipe(grid).forEach(([wr, wc]) => {
        const wKey = `${wr},${wc}`;
        if (!clearedKeys.has(wKey)) {
          clearedKeys.add(wKey);
          queue.push(wKey);
        }
      });
      continue; // no row/col/diamond blast shape of its own — the wipe above IS its whole effect
    }

    const blast = specialType === SPECIAL_GEM_TYPE.LASER_ROW ? laserRowBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.LASER_COL ? laserColBlastCells(r, c)
      : specialType === SPECIAL_GEM_TYPE.DISCHARGER ? dischargerBlastCells(r, c)
      : [];

    for (const [br, bc] of blast) {
      // Skip off-board, blocked, and Obsidian cells — a blast never destroys Obsidian.
      if (!isDestroyable(grid, br, bc)) continue;
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

  // NEW — the actual grid mutation for a spawned Obsidian gem. A
  // documented exception to this module's usual "read grid, don't
  // write it" split — see file header. Written here (rather than
  // returned as data for main.js to apply) so main.js doesn't need to
  // duplicate the exact same "don't land on a currently-clearing
  // cell" exclusion logic a second time.
  if (obsidianSpawn) {
    const [or, oc] = obsidianSpawn;
    grid[or][oc] = OBSIDIAN;
  }

  return { clearedCells, spawns, matchedGroups, incidentalCells, obsidianSpawn };
}

/**
 * Hyperstar + normal gem swap — the classic same-color wipe. When
 * Frantic Star is held, `extraRandomTarget` also wipes a second random
 * gem color in the same activation.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} targetGemType
 * @param {boolean} [extraRandomTarget=false]
 * @returns {[number, number][]}
 */
export function triggerHyperstarSingle(grid, hyperRow, hyperCol, targetGemType, extraRandomTarget = false) {
  const cleared = [[hyperRow, hyperCol]];

  // Shared "wipe every cell of this one color" pass, reused for both
  // the primary target and (when Frantic Star is active) the extra
  // random second target below.
  const wipeColor = (color) => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (r === hyperRow && c === hyperCol) continue; // the origin cell is already pushed above
        if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) continue; // never incidentally destroy another Hyperstar
        if (grid[r][c] === color) cleared.push([r, c]);
      }
    }
  };

  wipeColor(targetGemType);

  // NEW — Frantic Star: also wipe one random OTHER gem color in the
  // same activation. A single retry avoids (but doesn't strictly
  // require avoiding) rolling the SAME color as the primary target —
  // if it does happen, wipeColor() just re-wipes an already-wiped
  // color harmlessly, so this is purely a "make it feel more
  // interesting" nicety, not a correctness requirement.
  if (extraRandomTarget) {
    let secondColor = rand(GEM_TYPES_TOTAL);
    if (secondColor === targetGemType) secondColor = rand(GEM_TYPES_TOTAL);
    wipeColor(secondColor);
  }

  return cleared;
}

/**
 * Frantic Star's unprompted self-activation: picks ONE random
 * Hyperstar currently sitting on the board (if any) and fires it
 * exactly like a swap-activated wipe would, except there's no swap
 * partner to take a color from at all — BOTH wiped colors are random
 * (per design: a self-activation always wipes two colors, same total
 * effect as a Frantic-Star-boosted swap activation).
 *
 * @param {number[][]} grid
 * @returns {{ hyperRow: number, hyperCol: number, clearedCells: [number, number][] } | null}
 *   null if there is currently no Hyperstar anywhere on the board.
 */
export function triggerHyperstarSelfActivation(grid) {
  const hyperstarCells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) hyperstarCells.push([r, c]);
    }
  }
  if (hyperstarCells.length === 0) return null;

  const [hyperRow, hyperCol] = hyperstarCells[Math.floor(Math.random() * hyperstarCells.length)];

  let colorA = rand(GEM_TYPES_TOTAL);
  let colorB = rand(GEM_TYPES_TOTAL);
  if (colorB === colorA) colorB = rand(GEM_TYPES_TOTAL); // one retry, same nicety as triggerHyperstarSingle()

  const cleared = [[hyperRow, hyperCol]];
  [colorA, colorB].forEach(color => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (r === hyperRow && c === hyperCol) continue;
        if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) continue;
        if (grid[r][c] === color) cleared.push([r, c]);
      }
    }
  });

  return { hyperRow, hyperCol, clearedCells: cleared };
}

/**
 * Hyperstar + Laser swap: "convert and detonate." Every board cell
 * whose underlying color matches the swapped-with laser's color gets
 * converted into a laser gem itself, then every one of those
 * freshly-converted lasers immediately detonates.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} targetGemType
 * @returns {[number, number][]}
 */
export function triggerHyperstarLaserCombo(grid, hyperRow, hyperCol, targetGemType) {
  const cleared = new Set([`${hyperRow},${hyperCol}`]);

  const convertedLasers = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== targetGemType) continue;
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
      // Obsidian survives the laser blasts too.
      if (isDestroyable(grid, br, bc)) cleared.add(`${br},${bc}`);
    });
  });

  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * Hyperstar + Discharger swap: same "convert and detonate" pattern as
 * triggerHyperstarLaserCombo() above, converting to Dischargers.
 *
 * @param {number[][]} grid
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} targetGemType
 * @returns {[number, number][]}
 */
export function triggerHyperstarDischargerCombo(grid, hyperRow, hyperCol, targetGemType) {
  const cleared = new Set([`${hyperRow},${hyperCol}`]);

  const convertedDischargers = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== targetGemType) continue;
      if (specialGemState.grid[r][c] === SPECIAL_GEM_TYPE.HYPERSTAR) continue;

      specialGemState.grid[r][c] = SPECIAL_GEM_TYPE.DISCHARGER;
      convertedDischargers.push({ row: r, col: c });
    }
  }

  convertedDischargers.forEach(({ row, col }) => {
    cleared.add(`${row},${col}`);
    dischargerBlastCells(row, col).forEach(([br, bc]) => {
      if (isDestroyable(grid, br, bc)) cleared.add(`${br},${bc}`);
    });
  });

  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * Hyperstar + Hyperstar — clears the whole board.
 *
 * @param {number[][]} grid
 * @returns {[number, number][]}
 */
export function triggerHyperstarDouble(grid) {
  const cleared = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isDestroyable(grid, r, c)) cleared.push([r, c]);
    }
  }
  return cleared;
}

/**
 * Laser + Laser swap combo: clears the full row AND full column
 * through the swap's DESTINATION cell.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]}
 */
export function triggerLaserCombo(grid, row, col) {
  const cleared = new Set();
  [...laserRowBlastCells(row, col), ...laserColBlastCells(row, col)].forEach(([r, c]) => {
    if (isDestroyable(grid, r, c)) cleared.add(`${r},${c}`);
  });
  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * Discharger + Laser swap combo: clears 3 full rows or 3 full
 * columns, centered on wherever the DISCHARGER itself ended up.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @param {string} laserOrientation
 * @returns {[number, number][]}
 */
export function triggerDischargerLaserCombo(grid, row, col, laserOrientation) {
  const cleared = new Set();

  if (laserOrientation === SPECIAL_GEM_TYPE.LASER_ROW) {
    [row - 1, row, row + 1].forEach(r => {
      if (r < 0 || r >= SIZE) return;
      laserRowBlastCells(r, col).forEach(([rr, cc]) => {
        if (isDestroyable(grid, rr, cc)) cleared.add(`${rr},${cc}`);
      });
    });
  } else {
    [col - 1, col, col + 1].forEach(c => {
      if (c < 0 || c >= SIZE) return;
      laserColBlastCells(row, c).forEach(([rr, cc]) => {
        if (isDestroyable(grid, rr, cc)) cleared.add(`${rr},${cc}`);
      });
    });
  }

  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * Discharger + Discharger swap combo: row+column+diagonals burst,
 * centered on the swap's destination cell.
 *
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @returns {[number, number][]}
 */
export function triggerDischargerDouble(grid, row, col) {
  const cleared = new Set();
  radialBurstCells(row, col).forEach(([r, c]) => {
    if (isDestroyable(grid, r, c)) cleared.add(`${r},${c}`);
  });
  return [...cleared].map(key => key.split(',').map(Number));
}

/**
 * NEW — Overcharge Essence: picks `count` random currently-plain
 * (non-special, non-BLOCKED, non-Obsidian) cells on the board and
 * converts each into either a Laser Beam (random row/col orientation)
 * or a Discharger (50/50), independently per cell. Only touches
 * specialGemState — the underlying color in `grid` itself is left
 * exactly as it was, same as any other special-gem spawn.
 *
 * @param {number[][]} grid
 * @param {number} count
 * @returns {void}
 */
export function convertRandomPlainGemsToSpecial(grid, count) {
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === BLOCKED || grid[r][c] === OBSIDIAN) continue;
      if (specialGemState.grid[r][c]) continue; // already special — skip
      candidates.push([r, c]);
    }
  }

  // Shuffle-and-take — same Fisher-Yates convention used everywhere
  // else in this project a random subset is needed.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  candidates.slice(0, count).forEach(([r, c]) => {
    if (Math.random() < 0.5) {
      specialGemState.grid[r][c] = Math.random() < 0.5 ? SPECIAL_GEM_TYPE.LASER_ROW : SPECIAL_GEM_TYPE.LASER_COL;
    } else {
      specialGemState.grid[r][c] = SPECIAL_GEM_TYPE.DISCHARGER;
    }
  });
}

/**
 * Writes a batch of spawn decisions into specialGemState.grid.
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
 * Clears the special-gem overlay at a batch of cells.
 *
 * @param {[number, number][]} cells
 * @returns {void}
 */
export function clearSpecialGems(cells) {
  cells.forEach(([r, c]) => { specialGemState.grid[r][c] = null; });
}

/**
 * (Re)builds specialGemState.grid as a fresh SIZE x SIZE grid of nulls.
 *
 * @returns {void}
 */
export function resetSpecialGems() {
  specialGemState.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}