// ============================================================
// MAIN.JS — entry point and game loop.
//
// Owns all mutable game state (grid, score, moves, selection) and
// decides *when* things happen. board.js decides *what's legal*,
// render.js decides *how it looks*. This file should stay thin —
// if logic is getting complicated, it probably belongs in board.js.
//
// NEW THIS ROUND:
//   - Discharger combos: three new swap-activated cases in
//     attemptSwap() (Hyperstar+Discharger, Discharger+Laser,
//     Discharger+Discharger), mirroring the existing Hyperstar/Laser
//     combo pattern. See special_gem.js for the actual cell math.
//   - Hint feature: scheduleHintTimer()/showHintNow() highlight a
//     legal move after HINT_DELAY_MS of no real match/cascade. Only
//     ever (re)scheduled from checkEndState(), since every call to
//     checkEndState() is itself only ever reached as a consequence of
//     a real match — see checkEndState()'s doc comment.
//
// (Prior rounds' notes: drag-to-swap via onCellDragSwap(), the
// deferred level-up dialog via `pendingLevelUp`, and the stuck-board
// game-over dialog via showNoMovesDialog() — see their own doc
// comments below.)
// ============================================================

import {
  SIZE, findMatches, hasAnyMatch,
  hasPossibleMove, swap, collapseAndFill, BLOCKED, findHintMove
} from './board.js';

import {
  renderBoard, updateSelectedVisual, markMatchedGems,
  computeCellPitch, animateSwap, showHintHighlight
} from './render.js';

import { calculateCascadeStepScore } from './score.js';

import {
  PREVENT_DEADLOCK, DEFAULT_SCORE, SWAP_ANIM_MS, MATCH_CLEAR_DELAY_MS,
  CASCADE_CHECK_DELAY_MS, LEVEL_UP_BONUS_MOVES, ENABLE_MOVES_LIMIT, SCORE_POPUP_MS,
  NO_MOVES_GAME_OVER_DELAY_MS, HINT_DELAY_MS
} from '../resources/constant/constants.js';

import {
  GAME_NAME, GAME_TAGLINE, BUTTONS, DIALOG_TITLES, MESSAGES
} from '../resources/constant/text.js';

import {
  expandBoard, shrinkBoard, resetTiles,
  getExpandableCells, rebuildGridRespectingBlocked,
} from './tiles.js';

import { progressionState } from '../resources/progression/progression.js';
import { resetProgression, advanceLevel } from './progression.js';
import { resetBoons, generateBoonOffer, pickBoon } from './boon.js';
import { applyBoonEffect, resetBoonEffects } from './boon_effects.js';
import { TILE_SHAPES, GEM_DEFINITIONS, ALL_GEM_CATALOG } from '../resources/constant/constants.js';
import { getGemBaseScore, getGemBaseMultiplier } from './gem_base.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';

import { SPECIAL_GEM_TYPE } from '../resources/special%20gem/special_gem.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';
import {
  resolveSpecialGems, applySpawns, clearSpecialGems, resetSpecialGems,
  triggerHyperstarSingle, triggerHyperstarLaserCombo, triggerHyperstarDouble, triggerLaserCombo,
  triggerHyperstarDischargerCombo, triggerDischargerLaserCombo, triggerDischargerDouble,
} from './special_gem.js';

// --- DOM references, grabbed once ---
const boardEl         = document.getElementById('board');
const scoreEl         = document.getElementById('score');
const scorePopupEl    = document.getElementById('score-popup');
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
const globalMultiplierEl = document.getElementById('global-multiplier');
const globalBonusEl      = document.getElementById('global-bonus');
const gemStatsListEl     = document.getElementById('gem-stats-list');

// NEW — the whole "MOVES LEFT" stat block, so it can be hidden
// entirely when ENABLE_MOVES_LIMIT is off (constants.js).
const movesStatEl = document.getElementById('moves-stat');

// --- mutable game state ---
let grid;
let score;
let moves;
let selected; // [row, col] of the currently selected cell, or null
let placementMode; // 'construct' | 'deconstruct' | null — which action is armed
let placementShape; // key into SLOT_SHAPES, or null until the player picks one
// Holds the remaining placement phases for the boon currently being
// placed (one phase for a plain expand or shrink boon; two — expand
// then shrink, per the design doc's "addition first, then removal" —
// for a combined risky boon), plus what to call once every phase for
// this boon is done.
let tilePlacementQueue = [];
let tilePlacementFinalContinuation = null;
let busy; // true while an animation/cascade is resolving — blocks input
let comboCount; // how many cascade steps deep we are within one swap; resets each new swap

// NEW — handle for the score popup's pending "fade back out" timer,
// so a second popup arriving while the first is still showing can
// cancel and restart the clock instead of getting cut off early.
let scorePopupHideTimeout = null;
// Set by showLevelUpDialog(); holds the "resume/finish up" callback
// that the boon dialog invokes once the player has picked a boon.
let pendingContinuation = null;

// Set to true the moment ANY cascade step (normal match OR a
// swap-activated combo) crosses a level's score target, and only
// acted on once the WHOLE cascade has fully settled (see
// resolveMatches()'s `!hasAnyMatch` branch). This is what makes the
// level-up dialog wait for every chain-reaction step, spawn, and
// refill to finish before interrupting, instead of popping up the
// instant the target is crossed mid-cascade.
let pendingLevelUp = false;

// NEW — handle for the pending hint timer (see scheduleHintTimer()/
// showHintNow()). Tracked so a new schedule call can cancel whatever
// was pending before starting a fresh countdown.
let hintTimeoutId = null;

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
 * Hides the "MOVES LEFT" stat block entirely when the moves-limit
 * mechanic is shelved (ENABLE_MOVES_LIMIT === false in constants.js).
 * Called once on page load, not per-run — this is a feature flag,
 * not game state, so it never needs to toggle mid-session.
 *
 * @returns {void}
 */
function applyMovesLimitVisibility() {
  if (!ENABLE_MOVES_LIMIT) {
    movesStatEl.classList.add('hidden');
  }
}

/**
 * Renders the left-side stats panel: each active gem's current
 * matching bonus (its Affinity total), base score, and base
 * multiplier, plus the two global boon totals.
 *
 * The ONLY things that can change any of these numbers are boon
 * picks (Affinity/Bounty/Brilliance/Lust/Carat/Enthusiast/Addict/
 * Maniac/Fanatic, and the 4 global boons) — so this only needs to run
 * once in init() and again right after applyBoonEffect(), not on
 * every score change.
 *
 * Only the 7 ACTIVE gems are shown (GEM_DEFINITIONS) — the 4
 * locked/future gems (Onyx etc.) can still quietly accumulate Lust/
 * Maniac penalties in gemBaseState, but showing that here would just
 * be confusing before they're actually unlockable.
 *
 * Each row's "match" stat carries a small gem icon inline (the same
 * svg render.js uses for the board itself).
 *
 * @returns {void}
 */
function renderSideStats() {
  globalMultiplierEl.textContent = `${boonEffectState.globalScoreMultiplier.toFixed(2)}x`;
  globalBonusEl.textContent = signed(boonEffectState.globalScoreBonus);

  // Rebuilt from scratch every call — cheap at 7 rows, and much
  // simpler than diffing individual rows in place.
  gemStatsListEl.innerHTML = '';

  GEM_DEFINITIONS.forEach(({ id, name, file }) => {
    const baseScore = getGemBaseScore(id);
    const baseMultiplier = getGemBaseMultiplier(id);
    const matchBonus = boonEffectState.affinityBonus[id] || 0;

    const row = document.createElement('div');
    row.className = 'gem-stat-row';
    row.innerHTML = `
      <div class="gem-stat-name"><img class="gem-stat-icon" src="css/model/svg/${file}" alt="${name}">${name}</div>
      <div class="gem-stat-values">
        <span>base ${baseScore}</span>
        <span>x${baseMultiplier.toFixed(2)}</span>
        <span class="gem-stat-bonus">match ${signed(matchBonus)}</span>
      </div>
    `;
    gemStatsListEl.appendChild(row);
  });
}

/**
 * Converts a list of [row, col] pairs into the boolean SIZE x SIZE
 * grid markMatchedGems() (render.js) expects, so both the normal
 * match flow and every swap-activated combo can drive the same pop
 * animation off whatever cell list they actually cleared.
 *
 * @param {[number, number][]} cells
 * @returns {boolean[][]}
 */
function toBooleanGrid(cells) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  cells.forEach(([r, c]) => { g[r][c] = true; });
  return g;
}

/** Formats a score delta with an explicit sign; negative values keep their own "-". */
function signed(amount) {
  return amount >= 0 ? `+${amount}` : `${amount}`;
}

/**
 * Thin wrapper around render.js's renderBoard() so every call site in
 * this file automatically wires up drag-to-swap (onCellDragSwap)
 * without repeating `{ onCellSwap: onCellDragSwap }` at every call
 * site. Anything passed in `extraOptions` (currently just
 * `ghostCells`, during a tile placement) is merged in on top.
 *
 * @param {object} [extraOptions]
 * @returns {void}
 */
function renderBoardWithInteractions(extraOptions = {}) {
  renderBoard(boardEl, grid, onCellClick, { onCellSwap: onCellDragSwap, ...extraOptions });
}

/**
 * NEW — (re)starts the hint countdown: cancels whatever was pending
 * and schedules showHintNow() to fire HINT_DELAY_MS from now. ONLY
 * ever called from checkEndState() (and once from init(), for the
 * very first idle moment before any match has happened yet) — every
 * checkEndState() call is itself only ever reached as a consequence
 * of a real match/cascade having just resolved, so this naturally
 * satisfies "the countdown only resets on a real match" without
 * needing to sprinkle calls to this all over the place.
 *
 * @returns {void}
 */
function scheduleHintTimer() {
  if (hintTimeoutId) clearTimeout(hintTimeoutId);
  hintTimeoutId = setTimeout(showHintNow, HINT_DELAY_MS);
}

/**
 * NEW — fires once HINT_DELAY_MS of idle time has passed since the
 * last real match. Finds a legal move (board.js's findHintMove()) and
 * highlights it (render.js's showHintHighlight()). Shows ONCE and
 * then just sits there — nothing re-triggers this on a loop; it only
 * disappears once the player actually acts (any swap attempt causes
 * a re-render, which wipes it for free — see showHintHighlight()'s
 * doc comment), or once the run ends/resets.
 *
 * @returns {void}
 */
function showHintNow() {
  if (busy) return; // safety net — shouldn't normally fire while busy/mid-cascade/dialog, but don't show a hint if it somehow does
  const move = findHintMove(grid);
  if (!move) return; // no legal move at all — the stuck-board game-over path handles that separately
  showHintHighlight(boardEl, [move.from, move.to]);
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
  // reset boon-driven state BEFORE progression — calculateScoreTarget()
  // reads the target-score multiplier, which must be back at 1.0 first
  resetBoonEffects();
  // "start over" always begins a fresh run at level 1
  resetProgression(1);
  resetBoons();
  resetTiles();
  resetSpecialGems();

  // resetTiles() (just above, already called) seeds tileState.blockedCells
  // with the starting blocked ring; pre-allocate a fully-blocked grid of
  // the right size, then let rebuildGridRespectingBlocked() fill in every
  // cell that ledger says should be usable. Two functions, one already
  // tested by the reshuffle path below, instead of duplicating the
  // "regen + reapply blocked" logic a second time here.
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(BLOCKED));
  rebuildGridRespectingBlocked(grid);
  score = DEFAULT_SCORE;
  moves = progressionState.movesAllowed;
  selected = null;
  placementMode = null;
  placementShape = null;
  // Holds the remaining placement phases for the boon currently being
  // placed (one phase for a plain expand or shrink boon; two — expand
  // then shrink, per the design doc's "addition first, then removal" —
  // for a combined risky boon), plus what to call once every phase for
  // this boon is done.
  tilePlacementQueue = [];
  tilePlacementFinalContinuation = null;
  busy = false;
  comboCount = 0;
  pendingContinuation = null;
  pendingLevelUp = false;

  scoreEl.textContent = score;
  movesEl.textContent = moves;
  targetEl.textContent = progressionState.scoreTarget;
  levelEl.textContent = progressionState.level;
  messageEl.textContent = MESSAGES.SELECT_PROMPT;

  loseDialogEl.classList.add('hidden');
  levelUpDialogEl.classList.add('hidden');
  boonDialogEl.classList.add('hidden');

  loseDialogEl.classList.add('hidden');
  levelUpDialogEl.classList.add('hidden');
  boonDialogEl.classList.add('hidden');

  renderSideStats(); // reflect the freshly-reset boon/gem state
  renderBoardWithInteractions();
  scheduleHintTimer(); // NEW — the very first idle moment, before any match has happened yet
}

/**
 * Floats score-change text above the board for SCORE_POPUP_MS, then
 * fades it back out.
 *
 * Calling this again while a popup is already showing just updates
 * the text and restarts the timer, rather than stacking a second
 * popup or letting the first one's timer cut the new text short —
 * useful during a fast multi-step cascade.
 *
 * @param {string} text
 * @returns {void}
 */
function showScorePopup(text) {
  scorePopupEl.textContent = text;
  scorePopupEl.classList.add('visible');

  // Cancel any previous pending fade-out — otherwise an earlier call's
  // timer could fire mid-cascade and hide text a later call just set.
  if (scorePopupHideTimeout) clearTimeout(scorePopupHideTimeout);
  scorePopupHideTimeout = setTimeout(() => {
    scorePopupEl.classList.remove('visible');
    scorePopupHideTimeout = null;
  }, SCORE_POPUP_MS);
}

/**
 * Adds `gained` to the score, updates the display, and advances the
 * level (possibly more than once) if the new score clears the current
 * target. Shared by the normal match flow AND every swap-activated
 * special-gem combo, so level-up handling can't drift out of sync
 * between any of them.
 *
 * Does NOT show the level-up dialog itself — callers decide WHEN via
 * `pendingLevelUp`, so a cascade can keep running after crossing a
 * target instead of being interrupted mid-chain-reaction.
 *
 * @param {number} gained - score to add.
 * @param {string} popupText - text to float above the board if this
 *   gain DIDN'T level up.
 * @returns {boolean} true if at least one level was cleared.
 */
function applyScoreGain(gained, popupText) {
  score += gained;
  scoreEl.textContent = score;

  let leveledUp = false;
  while (score >= progressionState.scoreTarget) {
    advanceLevel();
    // Bonus moves on level-up only mean anything if moves are being
    // tracked at all — skip the grant when the mechanic is off.
    if (ENABLE_MOVES_LIMIT) {
      moves += LEVEL_UP_BONUS_MOVES;
    }
    leveledUp = true;
  }

  if (leveledUp) {
    levelEl.textContent = progressionState.level;
    targetEl.textContent = progressionState.scoreTarget;
    movesEl.textContent = moves;
    // The level-up dialog is about to cover the screen — blank the
    // status line so it doesn't show a stale prompt underneath it.
    messageEl.textContent = '';
  } else {
    // NEW — score deltas float above the board instead of appearing
    // in the #message line.
    showScorePopup(popupText);
  }

  return leveledUp;
}

/**
 * Swaps the start screen in for the game container.
 *
 * @returns {void}
 */
function showStartScreen() {
  gameContainerEl.classList.add('hidden');
  startScreenEl.classList.remove('hidden');
}

/**
 * Swaps the game container in for the start screen and begins a run.
 *
 * @returns {void}
 */
function startGame() {
  init();
  startScreenEl.classList.add('hidden');
  gameContainerEl.classList.remove('hidden');
}

/**
 * Click/tap handler for a board cell. Handles the select/deselect/swap
 * state machine.
 *
 * Only ever called for an actual tap (no significant pointer
 * movement) — a press-and-drag gesture instead goes through
 * onCellDragSwap() below, entirely bypassing the `selected` state
 * machine here.
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
 * Drag/swipe handler for a board cell. Fired by render.js when a
 * press-and-drag gesture on a gem cell resolves into a swap attempt.
 *
 * @param {number} r1 - row of the cell the drag started on.
 * @param {number} c1 - column of the cell the drag started on.
 * @param {number} r2 - row of the cell the drag points toward.
 * @param {number} c2 - column of the cell the drag points toward.
 * @returns {void}
 */
function onCellDragSwap(r1, c1, r2, c2) {
  if (busy) return;
  if (placementMode) return;

  if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) return;
  if (grid[r1][c1] === BLOCKED || grid[r2][c2] === BLOCKED) return;

  selected = null;
  updateSelectedVisual(boardEl, selected);

  attemptSwap(r1, c1, r2, c2);
}

/**
 * Handles a board click while a boon-driven expand/shrink placement
 * is active.
 *
 * @param {number} anchorRow
 * @param {number} anchorCol
 * @returns {void}
 */
function handlePlacementClick(anchorRow, anchorCol) {
  if (placementMode === 'expand') {
    const placed = expandBoard(placementShape, anchorRow, anchorCol, grid);
    if (!placed) {
      messageEl.textContent = MESSAGES.EXPAND_INVALID;
      return;
    }
  } else if (placementMode === 'shrink') {
    const removed = shrinkBoard(placementShape, anchorRow, anchorCol, grid);
    if (!removed) {
      messageEl.textContent = MESSAGES.SHRINK_INVALID;
      return;
    }
    clearSpecialGems(removed);
  } else {
    return;
  }

  advanceTilePlacement();
}

/**
 * Entry point from the boon dialog for a boon whose effect is a
 * board-shape change.
 *
 * @param {object} def
 * @param {() => void} onContinue
 * @returns {void}
 */
function startTilePlacement(def, onContinue) {
  const { effect } = def;
  tilePlacementQueue = [];

  if (effect.kind === 'board_expand' || effect.kind === 'board_expand_and_shrink') {
    tilePlacementQueue.push({ action: 'expand', shape: effect.expandShape ?? effect.shape });
  }
  if (effect.kind === 'board_shrink' || effect.kind === 'board_expand_and_shrink') {
    tilePlacementQueue.push({ action: 'shrink', shape: effect.shrinkShape ?? effect.shape });
  }

  tilePlacementFinalContinuation = onContinue;
  advanceTilePlacement();
}

/**
 * Moves to the next queued placement phase.
 *
 * @returns {void}
 */
function advanceTilePlacement() {
  if (tilePlacementQueue.length === 0) {
    rebuildGridRespectingBlocked(grid);
    renderBoardWithInteractions();

    const finish = tilePlacementFinalContinuation;
    tilePlacementFinalContinuation = null;
    placementMode = null;
    placementShape = null;
    messageEl.textContent = MESSAGES.SELECT_PROMPT;

    busy = true;

    if (finish) finish();
    return;
  }

  const phase = tilePlacementQueue.shift();
  placementMode = phase.action;
  placementShape = phase.shape;

  busy = false;

  if (placementMode === 'expand') {
    messageEl.textContent = `click a highlighted cell to grow your board with a ${TILE_SHAPES[placementShape].label} tile`;
    renderBoardWithInteractions({ ghostCells: getExpandableCells(grid) });
  } else {
    messageEl.textContent = `click the top-left of a ${TILE_SHAPES[placementShape].label} area to remove from your board`;
    renderBoardWithInteractions();
  }
}

/**
 * Shared tail-end for every swap-ACTIVATED special-gem combo. Always
 * continues the cascade — a swap-activated combo's cleared cells
 * still collapse/refill and can still chain into further matches, so
 * interrupting here would cut that short. If this step crossed a
 * target, `pendingLevelUp` is set instead, and resolveMatches() shows
 * the dialog once the whole cascade has fully settled.
 *
 * @param {[number, number][]} clearedCells
 * @param {number} gained
 * @param {string} popupText
 * @returns {void}
 */
function finishSwapActivatedCombo(clearedCells, gained, popupText) {
  if (ENABLE_MOVES_LIMIT) {
    moves--;
    movesEl.textContent = moves;
  }
  comboCount = 0;

  const leveledUp = applyScoreGain(gained, popupText);
  if (leveledUp) pendingLevelUp = true;

  markMatchedGems(boardEl, toBooleanGrid(clearedCells));

  continueCascadeAfterMatch(clearedCells);
}

/**
 * Hyperstar + a plain normal gem — classic same-color wipe. As of
 * this round, Laser and Discharger each have their own dedicated
 * combo (see below) — this function is now only reached for an
 * ordinary gem with no special overlay.
 *
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} targetGemType
 * @returns {void}
 */
function handleHyperstarSingle(hyperRow, hyperCol, targetGemType) {
  const clearedCells = triggerHyperstarSingle(grid, hyperRow, hyperCol, targetGemType);
  const gained = calculateCascadeStepScore({
    matchedGroups: [{ gemType: targetGemType, length: clearedCells.length }],
    incidentalCells: [],
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `hyperstar! ${signed(gained)}`);
}

/**
 * Hyperstar + Laser — convert-and-detonate combo. Scored as
 * incidental cells (mixed colors under each detonated laser's blast).
 *
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} laserColorType
 * @returns {void}
 */
function handleHyperstarLaserCombo(hyperRow, hyperCol, laserColorType) {
  const clearedCells = triggerHyperstarLaserCombo(grid, hyperRow, hyperCol, laserColorType);
  const gained = calculateCascadeStepScore({
    matchedGroups: [],
    incidentalCells: clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c })),
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `hyperstar laser combo! ${signed(gained)}`);
}

/**
 * NEW — Hyperstar + Discharger — convert-and-detonate combo, mirrors
 * handleHyperstarLaserCombo() exactly, just converting to Dischargers.
 * Scored as incidental cells, same reasoning.
 *
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} dischargerColorType
 * @returns {void}
 */
function handleHyperstarDischargerCombo(hyperRow, hyperCol, dischargerColorType) {
  const clearedCells = triggerHyperstarDischargerCombo(grid, hyperRow, hyperCol, dischargerColorType);
  const gained = calculateCascadeStepScore({
    matchedGroups: [],
    incidentalCells: clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c })),
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `hyperstar discharger combo! ${signed(gained)}`);
}

/**
 * Hyperstar + Hyperstar — clears the whole board. Mixed colors, same
 * incidental-cell scoring reasoning as above.
 *
 * @returns {void}
 */
function handleHyperstarDouble() {
  const clearedCells = triggerHyperstarDouble(grid);
  const gained = calculateCascadeStepScore({
    matchedGroups: [],
    incidentalCells: clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c })),
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `double hyperstar! ${signed(gained)}`);
}

/**
 * Laser + Laser — combined row+column blast through the swap's
 * destination cell.
 *
 * @param {number} originRow - destination row (r2 from attemptSwap).
 * @param {number} originCol - destination col (c2 from attemptSwap).
 * @returns {void}
 */
function handleLaserCombo(originRow, originCol) {
  const clearedCells = triggerLaserCombo(grid, originRow, originCol);
  const gained = calculateCascadeStepScore({
    matchedGroups: [],
    incidentalCells: clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c })),
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `laser combo! ${signed(gained)}`);
}

/**
 * NEW — Discharger + Laser — clears 3 rows or 3 columns (matching the
 * laser's orientation), centered on wherever the Discharger itself
 * landed. Mixed colors, scored as incidental cells.
 *
 * @param {number} dischargerRow
 * @param {number} dischargerCol
 * @param {string} laserOrientation - SPECIAL_GEM_TYPE.LASER_ROW or LASER_COL.
 * @returns {void}
 */
function handleDischargerLaserCombo(dischargerRow, dischargerCol, laserOrientation) {
  const clearedCells = triggerDischargerLaserCombo(grid, dischargerRow, dischargerCol, laserOrientation);
  const gained = calculateCascadeStepScore({
    matchedGroups: [],
    incidentalCells: clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c })),
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `discharger laser combo! ${signed(gained)}`);
}

/**
 * NEW — Discharger + Discharger — the row+column+diagonals burst
 * (the old Star Gem effect), centered on the swap's destination.
 * Mixed colors, scored as incidental cells.
 *
 * @param {number} originRow - destination row (r2 from attemptSwap).
 * @param {number} originCol - destination col (c2 from attemptSwap).
 * @returns {void}
 */
function handleDischargerDouble(originRow, originCol) {
  const clearedCells = triggerDischargerDouble(grid, originRow, originCol);
  const gained = calculateCascadeStepScore({
    matchedGroups: [],
    incidentalCells: clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c })),
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `double discharger! ${signed(gained)}`);
}

/**
 * Attempts to swap two adjacent cells.
 *
 * Checked in this priority order once the swap has landed:
 *   1. Hyperstar + Hyperstar    -> wipe the whole board
 *   2. Hyperstar + Laser        -> convert-and-detonate (lasers)
 *   3. Hyperstar + Discharger   -> convert-and-detonate (dischargers)
 *   4. Hyperstar + a plain gem  -> classic same-color wipe
 *   5. Laser + Laser            -> combined row+column blast
 *   6. Discharger + Laser       -> 3 rows or 3 columns
 *   7. Discharger + Discharger  -> row+column+diagonals burst
 *   8. otherwise                -> normal findMatches() check
 *
 * Cases 1-7 are all swap-ACTIVATED — they happen because of WHAT was
 * swapped together, not because of any pattern the swap happened to
 * form — so none of them ever call findMatches() at all.
 *
 * Called identically whether the swap came from the click-select flow
 * (onCellClick) or the drag flow (onCellDragSwap) — this function has
 * no idea which one triggered it, by design.
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

  // Cancel any pending hint countdown the moment the player commits
  // to a swap — it should never fire mid-animation/cascade. It's NOT
  // rescheduled here (only checkEndState() does that) — per design,
  // an invalid/reverted swap does not restart the countdown.
  if (hintTimeoutId) {
    clearTimeout(hintTimeoutId);
    hintTimeoutId = null;
  }

  const pitch = computeCellPitch(boardEl);

  const preSwapType1 = grid[r1][c1];
  const preSwapType2 = grid[r2][c2];
  const preSwapSpecial1 = specialGemState.grid[r1][c1];
  const preSwapSpecial2 = specialGemState.grid[r2][c2];

  swap(grid, r1, c1, r2, c2);
  swap(specialGemState.grid, r1, c1, r2, c2);
  renderBoardWithInteractions();
  animateSwap(boardEl, r1, c1, r2, c2, pitch);

  setTimeout(() => {
    const hyperAt1 = preSwapSpecial1 === SPECIAL_GEM_TYPE.HYPERSTAR;
    const hyperAt2 = preSwapSpecial2 === SPECIAL_GEM_TYPE.HYPERSTAR;
    const laserAt1 = preSwapSpecial1 === SPECIAL_GEM_TYPE.LASER_ROW || preSwapSpecial1 === SPECIAL_GEM_TYPE.LASER_COL;
    const laserAt2 = preSwapSpecial2 === SPECIAL_GEM_TYPE.LASER_ROW || preSwapSpecial2 === SPECIAL_GEM_TYPE.LASER_COL;
    const dischargerAt1 = preSwapSpecial1 === SPECIAL_GEM_TYPE.DISCHARGER;
    const dischargerAt2 = preSwapSpecial2 === SPECIAL_GEM_TYPE.DISCHARGER;

    // --- case 1: Hyperstar + Hyperstar -> destroy the entire board ---
    if (hyperAt1 && hyperAt2) {
      handleHyperstarDouble();
      return;
    }

    // --- case 2: Hyperstar + Laser -> convert-and-detonate (lasers) ---
    if ((hyperAt1 && laserAt2) || (hyperAt2 && laserAt1)) {
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const laserColorType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarLaserCombo(hyperRow, hyperCol, laserColorType);
      return;
    }

    // --- case 3 (NEW): Hyperstar + Discharger -> convert-and-detonate (dischargers) ---
    if ((hyperAt1 && dischargerAt2) || (hyperAt2 && dischargerAt1)) {
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const dischargerColorType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarDischargerCombo(hyperRow, hyperCol, dischargerColorType);
      return;
    }

    // --- case 4: Hyperstar + a plain normal gem -> classic same-color wipe ---
    if (hyperAt1 || hyperAt2) {
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const targetGemType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarSingle(hyperRow, hyperCol, targetGemType);
      return;
    }

    // --- case 5: Laser + Laser -> combined row+column blast ---
    if (laserAt1 && laserAt2) {
      handleLaserCombo(r2, c2);
      return;
    }

    // --- case 6 (NEW): Discharger + Laser -> 3 rows or 3 columns
    // (matching the laser's orientation), centered on wherever the
    // Discharger itself ended up — this combo is asymmetric (like
    // the Hyperstar ones above), so it can't just use the swap
    // destination blindly the way Laser+Laser can. ---
    if ((dischargerAt1 && laserAt2) || (dischargerAt2 && laserAt1)) {
      const dischargerRow = dischargerAt1 ? r2 : r1;
      const dischargerCol = dischargerAt1 ? c2 : c1;
      const laserOrientation = dischargerAt1 ? preSwapSpecial2 : preSwapSpecial1;
      handleDischargerLaserCombo(dischargerRow, dischargerCol, laserOrientation);
      return;
    }

    // --- case 7 (NEW): Discharger + Discharger -> row+column+diagonals
    // burst, centered on the swap destination (symmetric, like Laser+Laser) ---
    if (dischargerAt1 && dischargerAt2) {
      handleDischargerDouble(r2, c2);
      return;
    }

    // --- case 8: nothing special activated by this swap — fall back
    // to the normal match-detection flow, exactly as before ---
    const matched = findMatches(grid);

    if (!hasAnyMatch(matched)) {
      messageEl.textContent = MESSAGES.INVALID_SWAP;
      const revertPitch = computeCellPitch(boardEl);
      swap(grid, r1, c1, r2, c2);
      swap(specialGemState.grid, r1, c1, r2, c2);
      renderBoardWithInteractions();
      animateSwap(boardEl, r1, c1, r2, c2, revertPitch);
      setTimeout(() => { busy = false; }, SWAP_ANIM_MS);
      return;
    }

    if (ENABLE_MOVES_LIMIT) {
      moves--;
      movesEl.textContent = moves;
    }
    messageEl.textContent = '';
    comboCount = 0;
    resolveMatches();
  }, SWAP_ANIM_MS);
}

/**
 * Recursive-by-timeout loop: pop current matches, award combo-scaled
 * score, check for a level-up, collapse+refill, then check for new
 * matches caused by the fall (cascades). Repeats until the board is
 * stable, then hands off to checkEndState() — UNLESS a level-up
 * happened somewhere along the way, in which case the level-up
 * dialog is shown instead (see `pendingLevelUp`).
 *
 * @returns {void}
 */
function resolveMatches() {
  const matched = findMatches(grid);

  if (!hasAnyMatch(matched)) {
    if (pendingLevelUp) {
      pendingLevelUp = false;
      showLevelUpDialog(() => {
        busy = false;
        checkEndState();
      });
      return;
    }

    busy = false;
    checkEndState();
    return;
  }

  comboCount++;

  const { clearedCells, spawns, matchedGroups, incidentalCells } = resolveSpecialGems(grid, matched);
  applySpawns(spawns);

  const gained = calculateCascadeStepScore({ matchedGroups, incidentalCells, comboCount });
  const comboMessage = comboCount > 1 ? `combo x${comboCount}! ${signed(gained)}` : signed(gained);
  const leveledUp = applyScoreGain(gained, comboMessage);

  if (leveledUp) pendingLevelUp = true;

  markMatchedGems(boardEl, toBooleanGrid(clearedCells));

  continueCascadeAfterMatch(clearedCells);
}

/**
 * Clears matched cells, lets gravity + refill run, and schedules the
 * next cascade check. Split out from resolveMatches() so the
 * level-up dialog can defer this step until the player is ready to
 * continue, instead of it always firing on a timer.
 *
 * This function is deliberately two nested setTimeouts, not one:
 *   1. MATCH_CLEAR_DELAY_MS   — waits for the "pop" animation
 *      (gems.css, .matched) to finish playing before the DOM is
 *      rebuilt out from under it. If we cleared/rebuilt immediately,
 *      the pop animation would get cut off mid-play.
 *   2. CASCADE_CHECK_DELAY_MS — a short pause AFTER the board has
 *      re-rendered post-collapse, purely so a cascade match doesn't
 *      pop into view instantly. Purely cosmetic pacing, not needed
 *      for correctness.
 *
 * @param {[number, number][]} clearedCells - flat list of [row, col]
 *   pairs to clear, as returned by resolveSpecialGems() (normal match
 *   path) or triggerHypercube() (swap-activation path). NOT a
 *   boolean grid — do not confuse with findMatches()'s return shape.
 * @returns {void}
 */
function continueCascadeAfterMatch(clearedCells) {
  // wait out the pop animation before touching the grid/DOM again
  setTimeout(() => {
    // mark cleared cells transient (-1), not BLOCKED — collapseAndFill()
    // will fill these back in below
    clearedCells.forEach(([r, c]) => { grid[r][c] = -1; });

    // wipe the overlay BEFORE gravity, so no stale special flag
    // carries onto whatever gem falls into that spot
    clearSpecialGems(clearedCells);

    // gravity + refill; overlay rides along as a parallel grid
    collapseAndFill(grid, [specialGemState.grid]);
    renderBoardWithInteractions();
    // short cosmetic pause, then check for a cascade
    setTimeout(resolveMatches, CASCADE_CHECK_DELAY_MS);
  }, MATCH_CLEAR_DELAY_MS);
}

/**
 * Shows the "Level Cleared!" dialog and stashes the callback that
 * finishes up once the player has moved on.
 *
 * @param {() => void} onContinue
 * @returns {void}
 */
function showLevelUpDialog(onContinue) {
  pendingContinuation = onContinue;
  levelUpDialogEl.classList.remove('hidden');
}

/**
 * Builds and shows the pick-one-of-three boon dialog.
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
  offer.forEach(def => {
    const card = document.createElement('div');
    card.className = 'boon-card';

    const gemDef = def.effect?.gem ? ALL_GEM_CATALOG.find(g => g.id === def.effect.gem) : null;
    const iconHtml = gemDef
      ? `<img class="boon-card-gem-icon" src="css/model/svg/${gemDef.file}" alt="${gemDef.name}">`
      : '';

    card.innerHTML = `
      <div class="boon-card-header">
        ${iconHtml}
        <h3>${def.name}</h3>
      </div>
      <p>${def.description}</p>
    `;
    card.addEventListener('click', () => {
      pickBoon(def.id);
      applyBoonEffect(def);
      renderSideStats();
      boonDialogEl.classList.add('hidden');

      const isBoardShapeBoon =
        def.effect.kind === 'board_expand' ||
        def.effect.kind === 'board_shrink' ||
        def.effect.kind === 'board_expand_and_shrink';

      if (isBoardShapeBoon) {
        startTilePlacement(def, onContinue);
      } else {
        onContinue();
      }
    });

    boonChoicesEl.appendChild(card);
  });

  boonDialogEl.classList.remove('hidden');
}

/**
 * Called once a swap's cascade sequence has fully settled AND (if
 * this run leveled up) the level-up dialog/boon pick has finished.
 * Reshuffles the board if no legal move remains, otherwise shows the
 * normal prompt.
 *
 * NOTE: every call to this function is itself only ever reached as a
 * consequence of a real match/cascade having just resolved (see the
 * call sites in resolveMatches() and advanceTilePlacement()) — that's
 * what makes it safe for this to be the ONLY place that reschedules
 * the hint timer (scheduleHintTimer()) and still satisfy "the hint
 * countdown only resets on a real match."
 *
 * @returns {void}
 */
function checkEndState() {
  if (ENABLE_MOVES_LIMIT && moves <= 0) {
    if (score >= progressionState.scoreTarget) {
      messageEl.textContent = `target reached — final score ${score}`;
    } else {
      showLoseDialog();
    }
    return;
  }

  if (!hasPossibleMove(grid)) {
    if (PREVENT_DEADLOCK) {
      messageEl.textContent = MESSAGES.RESHUFFLING;
      setTimeout(() => {
        rebuildGridRespectingBlocked(grid);
        resetSpecialGems();
        renderBoardWithInteractions();
      }, 400);
    } else {
      busy = true;
      messageEl.textContent = MESSAGES.STUCK_BOARD;
      setTimeout(showNoMovesDialog, NO_MOVES_GAME_OVER_DELAY_MS);
    }
    return;
  }

  messageEl.textContent = MESSAGES.SELECT_PROMPT;
  scheduleHintTimer(); // NEW — the board just went idle after a real match; start the countdown
}

/**
 * Shows the lose dialog with the final score/target (ENABLE_MOVES_LIMIT case).
 *
 * @returns {void}
 */
function showLoseDialog() {
  busy = true;
  loseTitleEl.textContent = DIALOG_TITLES.LOSE;
  loseMessageEl.textContent = `Final score ${score} — target was ${progressionState.scoreTarget}`;
  loseDialogEl.classList.remove('hidden');
}

/**
 * Shows the "no legal moves left on the board" game-over dialog.
 * Reuses the same dialog element as showLoseDialog().
 *
 * @returns {void}
 */
function showNoMovesDialog() {
  loseTitleEl.textContent = DIALOG_TITLES.NO_MOVES;
  loseMessageEl.textContent = `${MESSAGES.NO_MOVES_GAME_OVER} — final score ${score}`;
  loseDialogEl.classList.remove('hidden');
}

startGameBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', init);
loseRestartBtn.addEventListener('click', () => {
  loseDialogEl.classList.add('hidden');
  showStartScreen();
});
levelUpNextBtn.addEventListener('click', () => {
  levelUpDialogEl.classList.add('hidden');
  showBoonDialog(pendingContinuation);
});

applyStaticText();
applyMovesLimitVisibility(); 
showStartScreen();