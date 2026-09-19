// ============================================================
// MAIN.JS — entry point and game loop.
//
// Owns all mutable game state (grid, score, moves, selection) and
// decides *when* things happen. board.js decides *what's legal*,
// render.js decides *how it looks*. This file should stay thin —
// if logic is getting complicated, it probably belongs in board.js.
// ============================================================

import {
  SIZE, createGridNoMatches, findMatches, hasAnyMatch,
  hasPossibleMove, swap, collapseAndFill, BLOCKED
} from './board.js';

import {
  renderBoard, updateSelectedVisual, markMatchedGems,
  computeCellPitch, animateSwap
} from './render.js';

import { calculateMatchScore } from './score.js';

import {
  PREVENT_DEADLOCK, DEFAULT_SCORE, POINTS_PER_GEM,
  SWAP_ANIM_MS, MATCH_CLEAR_DELAY_MS, CASCADE_CHECK_DELAY_MS,
  LEVEL_UP_BONUS_MOVES
} from '../resources/constant/constants.js';

import {
  GAME_NAME, GAME_TAGLINE, BUTTONS, DIALOG_TITLES, MESSAGES
} from '../resources/constant/text.js';

import { progressionState } from '../resources/progression/progression.js';
import { resetProgression, advanceLevel } from './progression.js';
import { resetBoons, generateBoonOffer, pickBoon } from './boon.js';
import { TILE_SHAPES } from '../resources/constant/constants.js';
import { tileState } from '../resources/tile/tileState.js';
import { constructTile, deconstructTile, resetTiles } from './tiles.js';

import { SPECIAL_GEM_TYPE } from '../resources/specialGem/specialGemDefinitions.js';
import { specialGemState } from '../resources/specialGem/specialGemState.js';
import { resolveSpecialGems, applySpawns, clearSpecialGems, triggerHypercube, resetSpecialGems } from './specialGems.js';

// --- DOM references, grabbed once ---
const boardEl         = document.getElementById('board');
const scoreEl         = document.getElementById('score');
const movesEl         = document.getElementById('moves');
const targetEl        = document.getElementById('target');
const messageEl       = document.getElementById('message');
const resetBtn        = document.getElementById('reset');
const levelEl         = document.getElementById('level');

const startScreenEl   = document.getElementById('start-screen');
const startGameBtn    = document.getElementById('start-game');
const gameContainerEl = document.getElementById('game-container');

const loseDialogEl    = document.getElementById('lose-dialog');
const loseTitleEl     = document.getElementById('lose-title');
const loseMessageEl   = document.getElementById('lose-message');
const loseRestartBtn  = document.getElementById('lose-restart');

const levelUpDialogEl = document.getElementById('levelup-dialog');
const levelUpTitleEl  = document.getElementById('levelup-title');
const levelUpNextBtn  = document.getElementById('levelup-next');

const boonDialogEl    = document.getElementById('boon-dialog');
const boonTitleEl     = document.getElementById('boon-title');
const boonChoicesEl   = document.getElementById('boon-choices');

const constructBtn       = document.getElementById('construct-btn');
const deconstructBtn     = document.getElementById('deconstruct-btn');
const shapePickerEl      = document.getElementById('shape-picker');
const shapeButtons       = document.querySelectorAll('.shape-btn');
const cancelPlacementBtn = document.getElementById('cancel-placement-btn');

// --- mutable game state ---
let grid;
let score;
let moves;
let selected;       // [r, c] of the currently selected cell, or null
let placementMode;  // 'construct' | 'deconstruct' | null — which action is armed
let placementShape; // key into SLOT_SHAPES, or null until the player picks one
let busy;           // true while an animation/cascade is resolving — blocks input
let comboCount;     // how many cascade steps deep we are within one swap; resets each new swap

// Set by showLevelUpDialog(); holds the "resume the cascade" callback
// that the boon dialog invokes once the player has picked a boon.
let pendingContinuation = null;

/**
 * Sets every bit of static, non-runtime-dependent text (title,
 * masthead, button labels, dialog titles) from text.js. This runs
 * once on page load, independent of whether a game is actually in
 * progress — the masthead/title need to be correct even while the
 * start screen is showing, before init() has ever run.
 *
 * @returns {void}
 */
function applyStaticText() {
  document.title = GAME_NAME;
  document.querySelector('.masthead h1').textContent = GAME_NAME;
  document.querySelector('.masthead p').textContent = GAME_TAGLINE;
  resetBtn.textContent = BUTTONS.RESET;
  levelUpNextBtn.textContent = BUTTONS.NEXT_LEVEL;
  loseTitleEl.textContent = DIALOG_TITLES.LOSE;
  levelUpTitleEl.textContent = DIALOG_TITLES.LEVEL_UP;
  boonTitleEl.textContent = DIALOG_TITLES.BOON;
}

/**
 * Converts a list of [row, col] pairs into the boolean SIZE x SIZE
 * grid markMatchedGems() (render.js) expects, so both the normal
 * match flow and the Hypercube flow can drive the same pop animation
 * off whatever cell list they actually cleared.
 *
 * @param {[number, number][]} cells
 * @returns {boolean[][]}
 */
function toBooleanGrid(cells) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  cells.forEach(([r, c]) => { g[r][c] = true; });
  return g;
}

/**
 * Adds `gained` to the score, updates the display, and advances the
 * level (possibly more than once) if the new score clears the current
 * target. Shared by the normal match flow and the Hypercube
 * swap-activation flow so level-up handling can't drift out of sync
 * between the two.
 *
 * @param {number} gained - score to add.
 * @param {string} comboMessage - message to show if this DIDN'T level up.
 * @returns {boolean} true if at least one level was cleared.
 */
function applyScoreGain(gained, comboMessage) {
  score += gained;
  scoreEl.textContent = score;

  let leveledUp = false;
  while (score >= progressionState.scoreTarget) {
    advanceLevel();
    moves += LEVEL_UP_BONUS_MOVES;
    leveledUp = true;
  }

  if (leveledUp) {
    levelEl.textContent = progressionState.level;
    targetEl.textContent = progressionState.scoreTarget;
    movesEl.textContent = moves;
    messageEl.textContent = '';
  } else {
    messageEl.textContent = comboMessage;
  }

  return leveledUp;
}

/**
 * Resets all game state to a fresh start and renders the initial board.
 * Called whenever a run actually begins — from the "Start Game" button
 * and from the in-game "start over" button. Does NOT touch the start
 * screen / game container visibility — callers decide that.
 *
 * @returns {void}
 */
function init() {
  // "start over" always begins a fresh run at level 1
  resetProgression(1);
  resetBoons();
  resetTiles();
  resetSpecialGems();

  grid = createGridNoMatches();
  score = DEFAULT_SCORE;
  moves = progressionState.movesAllowed;
  selected = null;
  placementMode = null;
  placementShape = null;
  busy = false;
  comboCount = 0;
  pendingContinuation = null;

  scoreEl.textContent = score;
  movesEl.textContent = moves;
  targetEl.textContent = progressionState.scoreTarget;
  levelEl.textContent = progressionState.level;
  messageEl.textContent = MESSAGES.SELECT_PROMPT;

  loseDialogEl.classList.add('hidden');
  levelUpDialogEl.classList.add('hidden');
  boonDialogEl.classList.add('hidden');
  shapePickerEl.classList.add('hidden');

  renderBoard(boardEl, grid, onCellClick);
}

/**
 * Swaps the start screen in for the game container. Used on load and
 * whenever a run ends (currently: losing) and the player should be
 * back at the "Start Game" button rather than mid-board.
 *
 * @returns {void}
 */
function showStartScreen() {
  gameContainerEl.classList.add('hidden');
  startScreenEl.classList.remove('hidden');
}

/**
 * Swaps the game container in for the start screen and begins a run.
 * Called when the player clicks "Start Game".
 *
 * @returns {void}
 */
function startGame() {
  init();
  startScreenEl.classList.add('hidden');
  gameContainerEl.classList.remove('hidden');
}

/**
 * Click handler for a board cell. Handles the select/deselect/swap
 * state machine: first click selects, clicking the same cell again
 * deselects, clicking a non-adjacent cell moves the selection there,
 * and clicking an adjacent cell attempts a swap.
 *
 * @param {number} r - row of the clicked cell.
 * @param {number} c - column of the clicked cell.
 * @returns {void}
 */
function onCellClick(r, c) {
  if (busy) return;

  if (placementMode) {
    handlePlacementClick(r, c);
    return;
  }

  // can't select a deconstructed cell
  if (grid[r][c] === BLOCKED) return;

  if (!selected) {
    selected = [r, c];
    updateSelectedVisual(boardEl, selected);
    return;
  }

  const [sr, sc] = selected;

  if (sr === r && sc === c) {
    selected = null;
    updateSelectedVisual(boardEl, selected);
    return;
  }

  const isAdjacent = Math.abs(sr - r) + Math.abs(sc - c) === 1;
  if (!isAdjacent) {
    selected = [r, c];
    updateSelectedVisual(boardEl, selected);
    return;
  }

  attemptSwap(sr, sc, r, c);
}

/**
 * Arms Construct or Deconstruct mode and opens the shape picker. Any
 * board click after this — once a shape is chosen — is interpreted
 * as a placement attempt instead of a normal select/swap.
 *
 * @param {'construct' | 'deconstruct'} mode
 * @returns {void}
 */
function enterPlacementMode(mode) {
  if (busy) return;
  placementMode = mode;
  placementShape = null;
  shapePickerEl.classList.remove('hidden');
  messageEl.textContent = 'choose a shape';
}

/**
 * Backs out of Construct/Deconstruct mode without placing anything.
 *
 * @returns {void}
 */
function cancelPlacement() {
  placementMode = null;
  placementShape = null;
  shapePickerEl.classList.add('hidden');
  messageEl.textContent = MESSAGES.SELECT_PROMPT;
}

/**
 * Records which shape the player picked and prompts for a board
 * click to anchor it.
 *
 * @param {string} shapeKey - key into SLOT_SHAPES.
 * @returns {void}
 */
function chooseShape(shapeKey) {
  placementShape = shapeKey;
  shapePickerEl.classList.add('hidden');
  messageEl.textContent = placementMode === 'construct'
    ? `click a cell for the top-left of your ${TILE_SHAPES[shapeKey].label} tile`
    : `click a cell for the top-left of the ${TILE_SHAPES[shapeKey].label} area to remove`;
}

/**
 * Handles a board click while Construct/Deconstruct mode is armed and
 * a shape has been chosen: attempts the placement, gives feedback on
 * failure (invalid cells — stays in placement mode so the player can
 * try another spot), and re-renders on success.
 *
 * @param {number} anchorRow
 * @param {number} anchorCol
 * @returns {void}
 */
function handlePlacementClick(anchorRow, anchorCol) {
  if (!placementShape) return; // shape not chosen yet — ignore board clicks

  if (placementMode === 'construct') {
    const tile = constructTile(placementShape, anchorRow, anchorCol, grid);
    if (!tile) {
      messageEl.textContent = "can't place there — try another cell";
      return;
    }
    messageEl.textContent = `${TILE_SHAPES[placementShape].label} tile constructed`;
  } else {
    const removed = deconstructTile(placementShape, anchorRow, anchorCol, grid);
    if (!removed) {
      messageEl.textContent = "can't remove there — try another cell";
      return;
    }
    messageEl.textContent = `${TILE_SHAPES[placementShape].label} area removed`;
  }

  placementMode = null;
  placementShape = null;
  renderBoard(boardEl, grid, onCellClick);
}

/**
 * Attempts to swap two adjacent cells: performs the swap, plays the
 * slide animation, then (after the animation finishes) checks whether
 * it created a match. Valid swaps consume a move and kick off
 * resolveMatches(); invalid swaps slide back to their original spots.
 *
 * @param {number} r1 - row of the first cell.
 * @param {number} c1 - column of the first cell.
 * @param {number} r2 - row of the second cell.
 * @param {number} c2 - column of the second cell.
 * @returns {void}
 */
function attemptSwap(r1, c1, r2, c2) {
  busy = true;
  selected = null;

  const pitch = computeCellPitch(boardEl);

  // Captured BEFORE the swap: which cell (if either) held a Hypercube,
  // and what gem type was at each cell. A Hypercube activates by being
  // swapped with something, not by forming a normal match, so this has
  // to be decided independently of findMatches().
  const preSwapType1 = grid[r1][c1];
  const preSwapType2 = grid[r2][c2];
  const preSwapSpecial1 = specialGemState.grid[r1][c1];
  const preSwapSpecial2 = specialGemState.grid[r2][c2];

  swap(grid, r1, c1, r2, c2);
  swap(specialGemState.grid, r1, c1, r2, c2); // the overlay swaps too, same as any other gem property
  renderBoard(boardEl, grid, onCellClick);
  animateSwap(boardEl, r1, c1, r2, c2, pitch);

  setTimeout(() => {
    const hyperAt1 = preSwapSpecial1 === SPECIAL_GEM_TYPE.HYPERCUBE;
    const hyperAt2 = preSwapSpecial2 === SPECIAL_GEM_TYPE.HYPERCUBE;

    if (hyperAt1 || hyperAt2) {
      // After the swap above, the Hypercube is now physically sitting
      // at whichever cell it moved INTO; the gem type it's paired with
      // is whatever was at the other cell before the swap.
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const targetGemType = hyperAt1 ? preSwapType2 : preSwapType1;

      moves--;
      movesEl.textContent = moves;
      comboCount = 0;

      const clearedCells = triggerHypercube(grid, hyperRow, hyperCol, targetGemType);
      const gained = calculateMatchScore(clearedCells.length, 1, POINTS_PER_GEM);
      const leveledUp = applyScoreGain(gained, `hypercube! +${gained}`);

      markMatchedGems(boardEl, toBooleanGrid(clearedCells));

      if (leveledUp) {
        showLevelUpDialog(() => continueCascadeAfterMatch(clearedCells));
      } else {
        continueCascadeAfterMatch(clearedCells);
      }
      return;
    }

    const matched = findMatches(grid);

    if (!hasAnyMatch(matched)) {
      messageEl.textContent = MESSAGES.INVALID_SWAP;
      const revertPitch = computeCellPitch(boardEl);
      swap(grid, r1, c1, r2, c2);
      swap(specialGemState.grid, r1, c1, r2, c2); // revert the overlay too
      renderBoard(boardEl, grid, onCellClick);
      animateSwap(boardEl, r1, c1, r2, c2, revertPitch);
      setTimeout(() => { busy = false; }, SWAP_ANIM_MS);
      return;
    }

    moves--;
    movesEl.textContent = moves;
    messageEl.textContent = '';
    comboCount = 0;
    resolveMatches();
  }, SWAP_ANIM_MS);
}

/**
 * Recursive-by-timeout loop: pop current matches, award combo-scaled
 * score, check for a level-up, collapse+refill, then check for new
 * matches caused by the fall (cascades). Repeats until the board is
 * stable, then hands off to checkEndState().
 *
 * @returns {void}
 */
function resolveMatches() {
  const matched = findMatches(grid);

  if (!hasAnyMatch(matched)) {
    busy = false;
    checkEndState();
    return;
  }

  comboCount++; // this cascade step counts as one combo hit

  const { clearedCells, spawns } = resolveSpecialGems(grid, matched);
  applySpawns(spawns);

  const gained = calculateMatchScore(clearedCells.length, comboCount, POINTS_PER_GEM);
  const comboMessage = comboCount > 1 ? `combo x${comboCount}! +${gained}` : `+${gained}`;
  const leveledUp = applyScoreGain(gained, comboMessage);

  markMatchedGems(boardEl, toBooleanGrid(clearedCells));

  if (leveledUp) {
    // Pause here: the cascade only resumes once the player dismisses
    // the level-cleared dialog and picks a boon.
    showLevelUpDialog(() => continueCascadeAfterMatch(clearedCells));
  } else {
    continueCascadeAfterMatch(clearedCells);
  }
}

/**
 * Clears matched cells, lets gravity + refill run, and schedules the
 * next cascade check. Split out from resolveMatches() so the
 * level-up dialog can defer this step until the player is ready to
 * continue, instead of it always firing on a timer.
 *
 * @param {boolean[][]} clearedCells - grid returned by findMatches() for
 *   the match that was just resolved.
 * @returns {void}
 */
function continueCascadeAfterMatch(clearedCells) {
  setTimeout(() => {
    clearedCells.forEach(([r, c]) => { grid[r][c] = -1; });
    clearSpecialGems(clearedCells);
    collapseAndFill(grid, [specialGemState.grid]);
    renderBoard(boardEl, grid, onCellClick);
    setTimeout(resolveMatches, CASCADE_CHECK_DELAY_MS);
  }, MATCH_CLEAR_DELAY_MS);
}

/**
 * Shows the "Level Cleared!" dialog and stashes the callback that
 * resumes the cascade once the player has moved on (via the boon
 * dialog's "Next Level" -> pick -> continue chain).
 *
 * @param {() => void} onContinue - called once the player has picked
 *   a boon (or there was nothing left to offer).
 * @returns {void}
 */
function showLevelUpDialog(onContinue) {
  pendingContinuation = onContinue;
  levelUpDialogEl.classList.remove('hidden');
}

/**
 * Builds and shows the pick-one-of-three boon dialog. Clicking a card
 * picks that boon immediately (no separate confirm button) and hands
 * off to `onContinue`. If the boon pool has nothing left to offer,
 * skips straight to `onContinue` so the game never stalls waiting on
 * an empty dialog.
 *
 * @param {() => void} onContinue - called after a boon is picked (or
 *   immediately, if nothing was available to offer).
 * @returns {void}
 */
function showBoonDialog(onContinue) {
  const offer = generateBoonOffer(3);

  if (offer.length === 0) {
    onContinue();
    return;
  }

  boonChoicesEl.innerHTML = '';
  // Build a card for each boon in the offer. Clicking a card picks
  // that boon and closes the dialog.
  offer.forEach(def => {
    const card = document.createElement('div');
    card.className = 'boon-card';
    card.innerHTML = `<h3>${def.name}</h3><p>${def.description}</p>`;
    card.addEventListener('click', () => {
      pickBoon(def.id);
      boonDialogEl.classList.add('hidden');
      onContinue();
    });
    boonChoicesEl.appendChild(card);
  });

  boonDialogEl.classList.remove('hidden');
}

/**
 * Called once a swap's cascade sequence has fully settled. Reshuffles
 * the board if no legal move remains, otherwise shows the normal
 * prompt (or a final-score message if the player is out of moves).
 *
 * @returns {void}
 */
function checkEndState() {
  if (moves <= 0) {
    if (score >= progressionState.scoreTarget) {
      messageEl.textContent = `target reached — final score ${score}`;
    } else {
      showLoseDialog();
    }
    return;
  }

  if (!hasPossibleMove(grid)) {
    // If PREVENT_DEADLOCK is true, reshuffle the board and let the player keep going.
    // Otherwise, the player is stuck and the run ends immediately.
    if (PREVENT_DEADLOCK) {
      messageEl.textContent = MESSAGES.RESHUFFLING;
      setTimeout(() => {
        grid = createGridNoMatches();
        tileState.blockedCells.forEach(([r, c]) => { grid[r][c] = BLOCKED; });
        resetSpecialGems();
        renderBoard(boardEl, grid, onCellClick);
      }, 400);
    } else {
      // The player is stuck and the run ends immediately.
      messageEl.textContent = MESSAGES.STUCK_BOARD;
    }
    return;
  }

  messageEl.textContent = MESSAGES.SELECT_PROMPT;
}

/**
 * Shows the lose dialog with the final score/target, and blocks
 * further input until the player restarts.
 *
 * @returns {void}
 */
function showLoseDialog() {
  busy = true;
  loseMessageEl.textContent = `Final score ${score} — target was ${progressionState.scoreTarget}`;
  loseDialogEl.classList.remove('hidden');
}

startGameBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', init);
loseRestartBtn.addEventListener('click', () => {
  // Game over goes back to the start screen, not straight into a new
  // run — the player has to press "Start Game" again to play.
  loseDialogEl.classList.add('hidden');
  showStartScreen();
});
levelUpNextBtn.addEventListener('click', () => {
  levelUpDialogEl.classList.add('hidden');
  showBoonDialog(pendingContinuation);
});
constructBtn.addEventListener('click', () => enterPlacementMode('construct'));
deconstructBtn.addEventListener('click', () => enterPlacementMode('deconstruct'));
cancelPlacementBtn.addEventListener('click', cancelPlacement);
shapeButtons.forEach(btn => {
  btn.addEventListener('click', () => chooseShape(btn.dataset.shape));
});

applyStaticText();
showStartScreen();
