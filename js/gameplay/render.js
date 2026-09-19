// ============================================================
// RENDER.JS — the only file allowed to touch the DOM for the board.
//
// This is the piece that gets replaced when we move to Phaser later.
// main.js and board.js should never need to change when this does.
//
// REWRITE THIS ROUND: the board used to always be a fixed 8x8, so
// every pixel-index calculation (computeCellPitch, animateSwap,
// markMatchedGems) could hardcode SIZE. Now the grid is allocated at
// up to 20x20 but only ever DISPLAYS the smallest rectangle containing
// the usable cells (board.js's getActiveBounds()) — plus, during an
// expand-board placement, a ring of "ghost" cells the player can click
// to grow the board. So every function below that used to assume "the
// grid is SIZE x SIZE" now reads the ACTUAL rendered rectangle's
// origin and width off boardEl.dataset, which renderBoard() stashes
// there every time it redraws.
// ============================================================

import { SIZE, BLOCKED, getActiveBounds } from './board.js';
import { GEM_DEFINITIONS } from '../resources/constant/constants.js';
import { tileState  } from '../resources/tile/tile_state.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';

/**
 * Converts an absolute (row, col) into the DOM child index of that
 * cell in the currently-rendered board — i.e. "how many .cell
 * elements come before this one in boardEl.children." Every function
 * below that needs to find a specific cell's DOM node (rather than
 * just looping over all of them) goes through this, so the
 * row/col -> index math lives in exactly one place.
 *
 * Reads minRow/minCol/numCols off boardEl.dataset rather than taking
 * them as parameters, so call sites (main.js) don't have to carry
 * that bookkeeping around themselves — renderBoard() is the only
 * place that needs to know it wrote them there.
 *
 * @param {HTMLElement} boardEl
 * @param {number} row - absolute board row.
 * @param {number} col - absolute board col.
 * @returns {number} index into boardEl.children.
 */
function cellIndex(boardEl, row, col) {
  const minRow = +boardEl.dataset.minRow;
  const minCol = +boardEl.dataset.minCol;
  const numCols = +boardEl.dataset.numCols;
  return (row - minRow) * numCols + (col - minCol);
}

/**
 * Rebuilds the #board element from scratch based on the current grid.
 *
 * Only draws the smallest rectangle containing every usable cell
 * (board.js's getActiveBounds()) — most of the allocated grid starts,
 * and often stays, BLOCKED padding the player never needs to see.
 * Pass `ghostCells` (only while an expand-board placement is active)
 * to additionally draw a ring of clickable-but-still-blocked cells
 * just past the current edge, and to widen the drawn rectangle enough
 * to fit them.
 *
 * @param {HTMLElement} boardEl - the #board container element.
 * @param {number[][]} grid - the current grid of gem type numbers.
 * @param {(r: number, c: number) => void} onCellClick - called with a
 *   cell's row/col whenever that cell is clicked.
 * @param {object} [options]
 * @param {[number, number][]} [options.ghostCells] - BLOCKED cells to
 *   render as clickable "extend here" targets instead of the normal
 *   greyed-out look, and to include in the drawn rectangle even
 *   though they're outside the usable area.
 * @returns {void}
 */
export function renderBoard(boardEl, grid, onCellClick, options = {}) {
  const { ghostCells = [] } = options;
  boardEl.innerHTML = '';

  // Start from the rectangle that actually contains gameplay, then
  // stretch it to also cover every ghost cell (if any) — a ghost cell
  // just past the current edge still needs to be inside the drawn
  // rectangle, or there'd be nowhere on screen to put it.
  let { minRow, maxRow, minCol, maxCol } = getActiveBounds(grid);
  const ghostKeys = new Set(ghostCells.map(([r, c]) => `${r},${c}`));
  ghostCells.forEach(([r, c]) => {
    if (r < minRow) minRow = r;
    if (r > maxRow) maxRow = r;
    if (c < minCol) minCol = c;
    if (c > maxCol) maxCol = c;
  });

  const numRows = maxRow - minRow + 1;
  const numCols = maxCol - minCol + 1;

  // Stashed on the element itself so the other exported functions
  // below (which only ever get handed the plain boardEl, not the
  // grid) can convert an absolute row/col back into a child index
  // without recomputing bounds from scratch every time.
  boardEl.dataset.minRow = minRow;
  boardEl.dataset.minCol = minCol;
  boardEl.dataset.numCols = numCols;

  // The board used to be a fixed 8x8, so CSS could hardcode
  // `repeat(8, 46px)`. Now the visible rectangle's size changes as
  // the player expands/shrinks the board, so JS drives the grid
  // template directly — this inline style always wins over whatever
  // default is left in layout.css.
  boardEl.style.gridTemplateColumns = `repeat(${numCols}, 46px)`;
  boardEl.style.gridTemplateRows = `repeat(${numRows}, 46px)`;

  // O(1) lookup for "is this cell part of a constructed bonus tile?"
  // (still the dormant markBonusTile()/installedTiles feature — see
  // tiles.js — untouched by this round's changes.)
  const tileCellKeys = new Set(
    tileState.installedTiles.flatMap(tile => tile.cells.map(([row, col]) => `${row},${col}`))
  );

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = row;
      cell.dataset.c = col;

      const gemType = grid[row][col];
      const key = `${row},${col}`;

      if (gemType === BLOCKED) {
        // A ghost cell is a blocked cell the player can click RIGHT
        // NOW to anchor an expand-board shape. Every other blocked
        // cell (including ones inside the visible rectangle — e.g. a
        // hole left by a past shrink) just looks like normal
        // unusable board.
        if (ghostKeys.has(key)) {
          cell.classList.add('cell--ghost');
        } else {
          cell.classList.add('cell--blocked');
        }
      } else {
        if (tileCellKeys.has(key)) {
          cell.classList.add('cell--tile');
        }
        const def = GEM_DEFINITIONS[gemType];
        const gem = document.createElement('div');
        gem.className = 'gem';
        gem.dataset.t = gemType;
        gem.style.backgroundImage = `url('css/model/svg/${def.file}')`;
        gem.setAttribute('role', 'img');
        gem.setAttribute('aria-label', def.name);
        const specialType = specialGemState.grid[row][col];
        if (specialType) {
          // specialType values (laser_row, laser_col, star, hyperstar)
          // are snake_case to match the project's JS naming
          // convention, but CSS classes here follow kebab-case — so
          // convert the underscore to a hyphen just for the class
          // name. The underlying string itself is untouched (it's
          // also used as a plain object key in specialGemState).
          gem.classList.add('gem--special', `gem--${specialType.replace(/_/g, '-')}`);
        }
        cell.appendChild(gem);
      }

      // Every cell gets a click handler, ghost cells included — a
      // ghost cell routes through the exact same onCellClick(row,col)
      // as any other cell; main.js's placement-mode branch is what
      // treats it differently, not this listener.
      cell.addEventListener('click', () => onCellClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

/**
 * Adds/removes the .selected class on both the cell (outline) and its
 * gem (lift + spin animation, defined in css/animation/select.css).
 *
 * @param {HTMLElement} boardEl - the #board container element.
 * @param {[number, number] | null} selected - [row, col] of the
 *   currently selected cell, or null if nothing is selected.
 * @returns {void}
 */
export function updateSelectedVisual(boardEl, selected) {
  boardEl.querySelectorAll('.cell').forEach(cell => {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const isSelected = !!selected && selected[0] === r && selected[1] === c;
    cell.classList.toggle('selected', isSelected);
    cell.querySelector('.gem')?.classList.toggle('selected', isSelected);
  });
}

/**
 * Measures pixel distance between adjacent cells so animateSwap can
 * compute slide offsets without hardcoding cell size/gap (those live
 * in css/design/layout.css and could change independently).
 *
 * Reads the rendered column count off boardEl.dataset (set by the
 * most recent renderBoard() call) instead of assuming SIZE — the
 * board's rendered width now varies as it grows/shrinks.
 *
 * @param {HTMLElement} boardEl - the #board container element, already rendered.
 * @returns {{x: number, y: number}} pixel distance to the next column (x)
 *   and next row (y).
 */
export function computeCellPitch(boardEl) {
  const numCols = +boardEl.dataset.numCols;
  const cells = boardEl.children;
  const origin = cells[0].getBoundingClientRect();
  const nextCol = cells[1].getBoundingClientRect();        // same row, next column
  const nextRow = cells[numCols].getBoundingClientRect();  // next row, same column
  return {
    x: nextCol.left - origin.left,
    y: nextRow.top - origin.top,
  };
}

/**
 * Plays the slide animation for a swap that already happened in the
 * grid data and has already been re-rendered. Call this right after
 * renderBoard() so the gems are in their new (post-swap) DOM spots.
 *
 * Technique: each gem is instantly offset (via inline transform, no
 * transition) back to where it visually was before the swap, then the
 * .gem-swap-transition class + a reset to translate(0,0) lets CSS
 * animate it sliding into its real spot.
 *
 * Cell lookups now go through cellIndex() instead of the old
 * row*SIZE+col math, since the rendered board's width isn't SIZE
 * anymore.
 *
 * @param {HTMLElement} boardEl - the #board container element, already re-rendered post-swap.
 * @param {number} row1 - row of the first swapped cell.
 * @param {number} col1 - column of the first swapped cell.
 * @param {number} row2 - row of the second swapped cell.
 * @param {number} col2 - column of the second swapped cell.
 * @param {{x: number, y: number}} pitch - result of computeCellPitch(), measured before the swap.
 * @returns {void}
 */
export function animateSwap(boardEl, row1, col1, row2, col2, pitch) {
  const gemAt1 = boardEl.children[cellIndex(boardEl, row1, col1)]?.querySelector('.gem'); // arrived from (r2,c2)
  const gemAt2 = boardEl.children[cellIndex(boardEl, row2, col2)]?.querySelector('.gem'); // arrived from (r1,c1)
  if (!gemAt1 || !gemAt2) return;

  const moves = [
    [gemAt1, (col2 - col1) * pitch.x, (row2 - row1) * pitch.y],
    [gemAt2, (col1 - col2) * pitch.x, (row1 - row2) * pitch.y],
  ];

  for (const [gem, startX, startY] of moves) {
    gem.style.transition = 'none';
    gem.style.transform = `translate(${startX}px, ${startY}px)`;
    void gem.offsetWidth; // force reflow so the start position registers before animating
    gem.style.transition = '';
    gem.classList.add('gem-swap-transition');
    gem.style.transform = 'translate(0px, 0px)';
  }
}

/**
 * Plays the pop animation on every gem in a matched cell.
 *
 * `matched` is still the full SIZE x SIZE grid findMatches() always
 * returns — that never changed. What changed is how a (r, c) in that
 * grid maps to a DOM child index, since the rendered rectangle isn't
 * SIZE x SIZE anymore. Cells outside the rendered rectangle (there
 * shouldn't be any matched ones — matches only ever happen among
 * usable cells — but the guard costs nothing) are just skipped.
 *
 * @param {HTMLElement} boardEl - the #board container element.
 * @param {boolean[][]} matched - grid returned by findMatches().
 * @returns {void}
 */
export function markMatchedGems(boardEl, matched) {
  const minRow = +boardEl.dataset.minRow;
  const minCol = +boardEl.dataset.minCol;

  for (let r = 0; r < matched.length; r++) {
    for (let c = 0; c < matched[r].length; c++) {
      if (!matched[r][c]) continue;
      if (r < minRow || c < minCol) continue; // outside what's currently drawn
      const index = cellIndex(boardEl, r, c);
      const gem = boardEl.children[index]?.querySelector('.gem');
      if (gem) gem.classList.add('matched');
    }
  }
}