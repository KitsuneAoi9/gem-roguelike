// ============================================================
// TILES.JS — construction (bonus tiles) + deconstruction (blocked
// cells) logic.
//
// Reads/writes tileState (../../resources/tile/tileState.js) but owns none
// of the state itself — same split as boon.js/shop.js. Unlike those
// two, this module also mutates the live grid directly
// (deconstructTile sets cells to BLOCKED), since "no gem spawns
// there" is a board-level fact, not just something to read later.
// ============================================================

import { SIZE, BLOCKED } from './board.js';
import { TILE_SHAPES } from '../resources/constant/constants.js';
import { tileState } from '../resources/tile/tile_state.js';

let nextTileId = 1;

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
 * blocked — the one check both construction and deconstruction need
 * before touching the grid.
 *
 * @param {[number, number][]} cells
 * @param {number[][]} grid
 * @returns {boolean}
 */
function allCellsUsable(cells, grid) {
  return cells.every(([r, c]) => inBounds(r, c) && grid[r][c] !== BLOCKED);
}

/**
 * Attempts to construct a bonus tile: validates the shape fits on the
 * board without overlapping a blocked cell, then records it in
 * tileState.installedTiles. Doesn't change any gem's type — cells
 * still spawn/match gems normally; this just flags them so a boon or
 * score.js can apply a bonus wherever it reads tileState from.
 *
 * @param {string} shapeKey - key into TILE_SHAPES.
 * @param {number} anchorRow - row of the shape's top-left cell.
 * @param {number} anchorCol - column of the shape's top-left cell.
 * @param {number[][]} grid - current grid, used only to check overlap
 *   with blocked cells.
 * @returns {{id: number, cells: [number, number][]} | null} the new
 *   tile, or null if the placement was invalid.
 */
export function constructTile(shapeKey, anchorRow, anchorCol, grid) {
  const cells = getShapeCells(shapeKey, anchorRow, anchorCol);
  if (cells.length === 0 || !allCellsUsable(cells, grid)) return null;

  const tile = { id: nextTileId++, cells };
  tileState.installedTiles.push(tile);
  return tile;
}

/**
 * Attempts to deconstruct cells: validates the shape fits on the
 * board and isn't already blocked, sets each cell to BLOCKED in the
 * live grid (so no gem occupies it, and collapseAndFill/findMatches
 * skip it from now on), and records the cells in
 * tileState.blockedCells so a board reshuffle can reapply them.
 *
 * @param {string} shapeKey - key into TILE_SHAPES.
 * @param {number} anchorRow - row of the shape's top-left cell.
 * @param {number} anchorCol - column of the shape's top-left cell.
 * @param {number[][]} grid - the live grid, mutated in place.
 * @returns {[number, number][] | null} the cells removed, or null if
 *   the placement was invalid.
 */
export function deconstructTile(shapeKey, anchorRow, anchorCol, grid) {
  const cells = getShapeCells(shapeKey, anchorRow, anchorCol);
  if (cells.length === 0 || !allCellsUsable(cells, grid)) return null;

  cells.forEach(([r, c]) => {
    grid[r][c] = BLOCKED;
    tileState.blockedCells.push([r, c]);
  });
  return cells;
}

/**
 * Clears all constructed tiles and blocked cells for a fresh run.
 * Call from main.js's init() alongside resetBoons()/resetShop().
 *
 * @returns {void}
 */
export function resetTiles() {
  tileState.installedTiles.length = 0;
  tileState.blockedCells.length = 0;
  nextTileId = 1;
}

// TODO: deconstructing a cell that's already part of a constructed
// tile doesn't currently clean that tile out of installedTiles — the
// tile keeps "existing" with a hole in it. Decide later whether that
// should split/shrink the tile or just be disallowed.