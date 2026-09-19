// ============================================================
// RENDER.JS — the only file allowed to touch the DOM for the board.
//
// This is the piece that gets replaced when we move to Phaser later.
// main.js and board.js should never need to change when this does.
// ============================================================

import { SIZE, BLOCKED } from './board.js';
import { GEM_DEFINITIONS } from '../resources/constant/constants.js';
import { tileState  } from '../resources/tile/tileState.js';
import { specialGemState } from '../resources/specialGem/specialGemState.js';

/**
 * Rebuilds the #board element from scratch based on the current grid.
 *
 * @param {HTMLElement} boardEl - the #board container element.
 * @param {number[][]} grid - the current grid of gem type numbers.
 * @param {(r: number, c: number) => void} onCellClick - called with a
 *   cell's row/col whenever that cell is clicked.
 * @returns {void}
 */
export function renderBoard(boardEl, grid, onCellClick) {
  boardEl.innerHTML = '';

  // O(1) lookup for "is this cell part of a constructed bonus tile?"
  const tileCellKeys = new Set(
    tileState .installedTiles.flatMap(tile => tile.cells.map(([row, col]) => `${row},${col}`))
  );

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = row;
      cell.dataset.c = col;

      const gemType = grid[row][col];

      if (gemType === BLOCKED) {
        cell.classList.add('cell--blocked');
      } else {
        if (tileCellKeys.has(`${row},${col}`)) {
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
          gem.classList.add('gem--special', `gem--${specialType}`);
        }
        cell.appendChild(gem);
      }

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
 * @param {HTMLElement} boardEl - the #board container element, already rendered.
 * @returns {{x: number, y: number}} pixel distance to the next column (x)
 *   and next row (y).
 */
export function computeCellPitch(boardEl) {
  const cells = boardEl.children;
  const origin = cells[0].getBoundingClientRect();
  const nextCol = cells[1].getBoundingClientRect();       // same row, next column
  const nextRow = cells[SIZE].getBoundingClientRect();    // next row, same column
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
 * @param {HTMLElement} boardEl - the #board container element, already re-rendered post-swap.
 * @param {number} row1 - row of the first swapped cell.
 * @param {number} col1 - column of the first swapped cell.
 * @param {number} row2 - row of the second swapped cell.
 * @param {number} col2 - column of the second swapped cell.
 * @param {{x: number, y: number}} pitch - result of computeCellPitch(), measured before the swap.
 * @returns {void}
 */
export function animateSwap(boardEl, row1, col1, row2, col2, pitch) {
  const gemAt1 = boardEl.children[row1 * SIZE + col1]?.querySelector('.gem'); // arrived from (r2,c2)
  const gemAt2 = boardEl.children[row2 * SIZE + col2]?.querySelector('.gem'); // arrived from (r1,c1)
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
 * @param {HTMLElement} boardEl - the #board container element.
 * @param {boolean[][]} matched - grid returned by findMatches().
 * @returns {void}
 */
export function markMatchedGems(boardEl, matched) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!matched[r][c]) continue;
      const index = r * SIZE + c;
      const gem = boardEl.children[index]?.querySelector('.gem');
      if (gem) gem.classList.add('matched');
    }
  }
}
