// ============================================================
// RENDER.JS — the only file allowed to touch the DOM for the board.
//
// This is the piece that gets replaced when we move to Phaser later.
// main.js and board.js should never need to change when this does.
//
// NEW THIS ROUND — Obsidian gem rendering: a cell holding board.js's
// OBSIDIAN sentinel is rendered as a plain, inert black square
// (placeholder styling in gems.css — real SVG art TBD, same "art not
// started yet" category as every other special-gem asset in this
// project) instead of going through the normal GEM_DEFINITIONS
// lookup (which only covers real gem-type indices and would crash on
// a negative one). It gets a plain click passthrough only — no drag
// wiring at all — since main.js's own OBSIDIAN guard in onCellClick()
// is what actually explains "nothing happens" to the player, same
// convention a BLOCKED cell already uses.
// ============================================================

import { SIZE, BLOCKED, OBSIDIAN, getActiveBounds } from './board.js';
import { GEM_DEFINITIONS, DRAG_SWAP_THRESHOLD_PX } from '../resources/constant/constants.js';
import { tileState  } from '../resources/tile/tile_state.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';

/**
 * Converts an absolute (row, col) into the DOM child index of that
 * cell in the currently-rendered board.
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
 * Wires up ONE gem cell's pointer interactions: plain tap/click
 * (calls onCellClick) AND press-and-drag toward a neighbor (calls
 * onCellSwap once the drag clears DRAG_SWAP_THRESHOLD_PX).
 *
 * @param {HTMLElement} cell
 * @param {number} row
 * @param {number} col
 * @param {(r: number, c: number) => void} onCellClick
 * @param {((r1: number, c1: number, r2: number, c2: number) => void) | undefined} onCellSwap
 * @returns {void}
 */
function wireCellInteraction(cell, row, col, onCellClick, onCellSwap) {
  // Per-cell drag state, captured in this closure — each cell gets
  // its own independent little state machine, reset every gesture.
  let startX = 0;
  let startY = 0;
  let dragFired = false;
  let pointerId = null;

  cell.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return; // ignore right/middle-click drags
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragFired = false;
    // Pointer capture keeps every subsequent pointermove/pointerup
    // for THIS gesture targeting this cell, even once the pointer
    // physically moves over a neighboring cell mid-drag — without
    // this, a fast drag would "leave" the starting cell's listeners
    // and we'd lose track of the gesture partway through.
    cell.setPointerCapture(pointerId);
  });

  cell.addEventListener('pointermove', (e) => {
    if (pointerId === null || dragFired || !onCellSwap) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Still within the "could just be a careful tap" zone — wait.
    if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SWAP_THRESHOLD_PX) return;

    // Whichever axis moved further decides the swap direction — a
    // mostly-horizontal drag swaps left/right, a mostly-vertical one
    // swaps up/down. A diagonal drag just picks whichever won; there's
    // no diagonal swap in this game.
    let targetRow = row;
    let targetCol = col;
    if (Math.abs(dx) > Math.abs(dy)) {
      targetCol = col + (dx > 0 ? 1 : -1);
    } else {
      targetRow = row + (dy > 0 ? 1 : -1);
    }

    dragFired = true;
    onCellSwap(row, col, targetRow, targetCol);
  });

  cell.addEventListener('pointerup', (e) => {
    if (pointerId !== null) cell.releasePointerCapture(pointerId);
    // No drag was fired this gesture — that means the pointer never
    // traveled past the threshold, so treat it as a plain tap/click.
    if (!dragFired) onCellClick(row, col);
    pointerId = null;
    dragFired = false;
  });

  cell.addEventListener('pointercancel', () => {
    // Gesture got interrupted (e.g. the browser took over for a
    // system gesture) — just reset, don't fire a click OR a swap.
    pointerId = null;
    dragFired = false;
  });
}

/**
 * Rebuilds the #board element from scratch based on the current grid.
 *
 * @param {HTMLElement} boardEl
 * @param {number[][]} grid
 * @param {(r: number, c: number) => void} onCellClick
 * @param {object} [options]
 * @param {[number, number][]} [options.ghostCells]
 * @param {(r1: number, c1: number, r2: number, c2: number) => void} [options.onCellSwap]
 * @returns {void}
 */
export function renderBoard(boardEl, grid, onCellClick, options = {}) {
  const { ghostCells = [], onCellSwap } = options;
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
  // `repeat(8, 69px)`. Now the visible rectangle's size changes as
  // the player expands/shrinks the board, so JS drives the grid
  // template directly — this inline style always wins over whatever
  // default is left in layout.css.
  boardEl.style.gridTemplateColumns = `repeat(${numCols}, 69px)`;
  boardEl.style.gridTemplateRows = `repeat(${numRows}, 69px)`;

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
        cell.addEventListener('click', () => onCellClick(row, col));
      } else if (gemType === OBSIDIAN) {
        // since Obsidian has no GEM_DEFINITIONS entry of its own (it's
        // a sentinel value, not a matchable color with a type index).
        // Still no drag wiring at all — just a passthrough click, so
        // onCellClick()'s own OBSIDIAN guard is what tells the player
        // "nothing to do here," same as a BLOCKED cell.
        cell.classList.add('cell--obsidian');
        const gem = document.createElement('div');
        gem.className = 'gem gem--obsidian';
        gem.style.backgroundImage = `url('css/model/svg/obsidian.svg')`;
        gem.setAttribute('role', 'img');
        gem.setAttribute('aria-label', 'Obsidian');
        cell.appendChild(gem);
        cell.addEventListener('click', () => onCellClick(row, col));
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

        // A real gem cell gets BOTH interaction modes wired together
        // — tap-to-select AND press-and-drag — so they can't race
        // each other (see wireCellInteraction()'s doc comment for
        // why this isn't just a separate 'click' listener anymore).
        wireCellInteraction(cell, row, col, onCellClick, onCellSwap);
      }

      boardEl.appendChild(cell);
    }
  }
}

/**
 * Adds/removes the .selected class on both the cell (outline) and its
 * gem (lift + spin animation).
 *
 * @param {HTMLElement} boardEl
 * @param {[number, number] | null} selected
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
 * compute slide offsets.
 *
 * @param {HTMLElement} boardEl
 * @returns {{x: number, y: number}}
 */
export function computeCellPitch(boardEl) {
  const numCols = +boardEl.dataset.numCols;
  const cells = boardEl.children;
  const origin = cells[0].getBoundingClientRect();
  const nextCol = cells[1].getBoundingClientRect();
  const nextRow = cells[numCols].getBoundingClientRect();
  return {
    x: nextCol.left - origin.left,
    y: nextRow.top - origin.top,
  };
}

/**
 * Plays the slide animation for a swap that already happened in the
 * grid data and has already been re-rendered.
 *
 * @param {HTMLElement} boardEl
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @param {{x: number, y: number}} pitch
 * @returns {void}
 */
export function animateSwap(boardEl, row1, col1, row2, col2, pitch) {
  const gemAt1 = boardEl.children[cellIndex(boardEl, row1, col1)]?.querySelector('.gem');
  const gemAt2 = boardEl.children[cellIndex(boardEl, row2, col2)]?.querySelector('.gem');
  if (!gemAt1 || !gemAt2) return;

  const moves = [
    [gemAt1, (col2 - col1) * pitch.x, (row2 - row1) * pitch.y],
    [gemAt2, (col1 - col2) * pitch.x, (row1 - row2) * pitch.y],
  ];

  for (const [gem, startX, startY] of moves) {
    gem.style.transition = 'none';
    gem.style.transform = `translate(${startX}px, ${startY}px)`;
    void gem.offsetWidth;
    gem.style.transition = '';
    gem.classList.add('gem-swap-transition');
    gem.style.transform = 'translate(0px, 0px)';
  }
}

/**
 * Plays the pop animation on every gem in a matched cell.
 *
 * @param {HTMLElement} boardEl
 * @param {boolean[][]} matched
 * @returns {void}
 */
export function markMatchedGems(boardEl, matched) {
  const minRow = +boardEl.dataset.minRow;
  const minCol = +boardEl.dataset.minCol;

  for (let r = 0; r < matched.length; r++) {
    for (let c = 0; c < matched[r].length; c++) {
      if (!matched[r][c]) continue;
      if (r < minRow || c < minCol) continue;
      const index = cellIndex(boardEl, r, c);
      const gem = boardEl.children[index]?.querySelector('.gem');
      if (gem) gem.classList.add('matched');
    }
  }
}

/**
 * Highlights a legal swap for the player.
 *
 * @param {HTMLElement} boardEl
 * @param {[number, number][]} cells
 * @returns {void}
 */
export function showHintHighlight(boardEl, cells) {
  cells.forEach(([r, c]) => {
    const index = cellIndex(boardEl, r, c);
    boardEl.children[index]?.classList.add('cell--hint');
  });
}