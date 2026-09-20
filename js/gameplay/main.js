// ============================================================
// MAIN.JS — entry point and game loop.
//
// Owns all mutable game state (grid, score, moves, selection) and
// decides *when* things happen. board.js decides *what's legal*,
// render.js decides *how it looks*. This file should stay thin —
// if logic is getting complicated, it probably belongs in board.js.
// ============================================================

import {
  SIZE, findMatches, hasAnyMatch,
  hasPossibleMove, swap, collapseAndFill, BLOCKED
} from './board.js';

import {
  renderBoard, updateSelectedVisual, markMatchedGems,
  computeCellPitch, animateSwap
} from './render.js';

import { calculateCascadeStepScore } from './score.js';

import {
  PREVENT_DEADLOCK, DEFAULT_SCORE, SWAP_ANIM_MS, MATCH_CLEAR_DELAY_MS,
  CASCADE_CHECK_DELAY_MS, LEVEL_UP_BONUS_MOVES, ENABLE_MOVES_LIMIT, SCORE_POPUP_MS
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
import { TILE_SHAPES, GEM_DEFINITIONS } from '../resources/constant/constants.js';
import { getGemBaseScore, getGemBaseMultiplier } from './gem_base.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';

import { SPECIAL_GEM_TYPE } from '../resources/special%20gem/special_gem.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';
import {
  resolveSpecialGems, applySpawns, clearSpecialGems, resetSpecialGems,
  triggerHyperstarSingle, triggerHyperstarLaserCombo, triggerHyperstarDouble, triggerLaserCombo,
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
 * @returns {void}
 */
function renderSideStats() {
  globalMultiplierEl.textContent = `${boonEffectState.globalScoreMultiplier.toFixed(2)}x`;
  globalBonusEl.textContent = signed(boonEffectState.globalScoreBonus);

  // Rebuilt from scratch every call — cheap at 7 rows, and much
  // simpler than diffing individual rows in place.
  gemStatsListEl.innerHTML = '';

  GEM_DEFINITIONS.forEach(({ id, name }) => {
    const baseScore = getGemBaseScore(id);
    const baseMultiplier = getGemBaseMultiplier(id);
    // "current matching bonus score" == this gem's flat Affinity
    // total. Frenzy is deliberately left out — it's a bonus/penalty
    // PAIR rather than one flat number, so it doesn't collapse into
    // a single figure the way Affinity does.
    const matchBonus = boonEffectState.affinityBonus[id] || 0;

    const row = document.createElement('div');
    row.className = 'gem-stat-row';
    row.innerHTML = `
      <div class="gem-stat-name">${name}</div>
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

/** Formats a score delta with an explicit sign; negative values keep their own "-". */
function signed(amount) {
  return amount >= 0 ? `+${amount}` : `${amount}`;
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
  renderBoard(boardEl, grid, onCellClick);
}

/**
 * Floats score-change text above the board for SCORE_POPUP_MS, then
 * fades it back out. This REPLACES the old behavior of writing score
 * deltas into the #message line below the board (see handoff) —
 * messageEl is now reserved for status text only (prompts, invalid
 * swap, reshuffling, placement instructions).
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
 * target. Shared by the normal match flow AND all four swap-activated
 * special-gem combos below, so level-up handling can't drift out of
 * sync between any of them.
 *
 * @param {number} gained - score to add.
 * @param {string} popupText - text to float above the board if this
 *   gain DIDN'T level up. (A level-up shows its own dialog instead,
 *   so there's no point floating a popup that would just get covered.)
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
 * Handles a board click while a boon-driven expand/shrink placement
 * is active. Unlike the old button-driven version, there's no
 * separate "shape chosen yet?" gate — a boon's shape is already
 * locked in the moment placement starts (see startTilePlacement()) —
 * and there's no cancel: the design calls this mandatory, since it
 * only ever runs after a cascade has fully settled.
 *
 * @param {number} anchorRow
 * @param {number} anchorCol
 * @returns {void}
 */
function handlePlacementClick(anchorRow, anchorCol) {
  if (placementMode === 'expand') {
    const placed = expandBoard(placementShape, anchorRow, anchorCol, grid);
    if (!placed) {
      // Invalid click — per the design doc, tell them and let them
      // try again; stay in placement mode, don't re-render (the
      // ghost-cell highlighting is still accurate, nothing changed).
      messageEl.textContent = MESSAGES.EXPAND_INVALID;
      return;
    }
  } else if (placementMode === 'shrink') {
    const removed = shrinkBoard(placementShape, anchorRow, anchorCol, grid);
    if (!removed) {
      messageEl.textContent = MESSAGES.SHRINK_INVALID;
      return;
    }
    // A cell that no longer exists can't keep hosting a special gem —
    // clear the overlay so nothing lingers "under" a blocked cell.
    // (Per the design doc: deconstructing a special-gem cell just
    // removes the gem, no blast triggers.)
    clearSpecialGems(removed);
  } else {
    return; // shouldn't happen — placementMode is only ever 'expand' or 'shrink' now
  }

  // This phase is done — advance to the next one (if this was a
  // combined expand-then-shrink boon) or finish up.
  advanceTilePlacement();
}

/**
 * Entry point from the boon dialog for a boon whose effect is a
 * board-shape change. Builds the ordered list of placement phases
 * this specific boon needs — one phase for a plain expand or shrink
 * boon, two (expand, then shrink) for a combined risky boon, per the
 * design doc's "addition first, then removal" — and starts the first
 * one. `onContinue` (the cascade-resuming callback showBoonDialog()
 * was already holding) is stashed rather than called immediately;
 * it only fires once every phase is placed AND the post-placement
 * reshuffle has run.
 *
 * @param {object} def - the picked BOON_POOL entry. Expected shapes:
 *   - { kind: 'board_expand', shape: 'THREE_BY_ONE' }
 *   - { kind: 'board_shrink', shape: 'ONE_BY_ONE' }
 *   - { kind: 'board_expand_and_shrink', expandShape: '...', shrinkShape: '...' }
 * @param {() => void} onContinue - resumes the cascade once fully done.
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
 * Moves to the next queued placement phase. Once the queue is empty —
 * every phase of this boon has been placed — reshuffles the board
 * and hands control back to whatever was waiting on the whole boon
 * to finish.
 *
 * BUGFIX: `busy` used to stay `true` the whole way through placement
 * (it's set `true` at the start of every swap and normally only
 * cleared once a cascade finds no more matches — but a board-shape
 * boon detours AROUND that cascade-resolution path entirely). Since
 * onCellClick()'s first line is `if (busy) return;`, every placement
 * click was being silently swallowed before it ever reached
 * handlePlacementClick() — ghost cells rendered fine, but clicking
 * one did nothing. Fixed by releasing `busy` for the duration of each
 * phase (so clicks are actually processed) and reclaiming it the
 * moment the whole boon is placed (so the resumed cascade still
 * blocks input exactly like it always has).
 *
 * @returns {void}
 */
function advanceTilePlacement() {
  if (tilePlacementQueue.length === 0) {
    rebuildGridRespectingBlocked(grid);
    renderBoard(boardEl, grid, onCellClick);

    const finish = tilePlacementFinalContinuation;
    tilePlacementFinalContinuation = null;
    placementMode = null;
    placementShape = null;
    messageEl.textContent = MESSAGES.SELECT_PROMPT;

    // Placement is fully done — we're handing off into the resumed
    // cascade (continueCascadeAfterMatch), which assumes `busy` is
    // `true` for the whole time it's running, same as a normal swap.
    busy = true;

    if (finish) finish();
    return;
  }

  const phase = tilePlacementQueue.shift();
  placementMode = phase.action;   // 'expand' | 'shrink'
  placementShape = phase.shape;

  // Let the player actually click a placement cell — see the bugfix
  // note above for why this line has to be here.
  busy = false;

  if (placementMode === 'expand') {
    messageEl.textContent = `click a highlighted cell to grow your board with a ${TILE_SHAPES[placementShape].label} tile`;
    renderBoard(boardEl, grid, onCellClick, { ghostCells: getExpandableCells(grid) });
  } else {
    messageEl.textContent = `click the top-left of a ${TILE_SHAPES[placementShape].label} area to remove from your board`;
    renderBoard(boardEl, grid, onCellClick);
  }
}

/**
 * Shared tail-end for every swap-ACTIVATED special-gem combo
 * (Hyperstar solo, Hyperstar+Laser, Hyperstar+Hyperstar, Laser+
 * Laser). All four skip findMatches() entirely — they're triggered
 * by WHAT was swapped, not by any pattern the swap happened to form —
 * but still need the same bookkeeping afterward: spend a move, reset
 * the combo counter (this is the start of a brand-new chain, not a
 * continuation of one), score it, play the pop animation, then either
 * detour into the level-up dialog or resume the cascade.
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
  markMatchedGems(boardEl, toBooleanGrid(clearedCells));

  if (leveledUp) {
    showLevelUpDialog(() => continueCascadeAfterMatch(clearedCells));
  } else {
    continueCascadeAfterMatch(clearedCells);
  }
}

/**
 * Hyperstar + a normal (or Star) gem — classic same-color wipe.
 * Scored as ONE oversized matched group (all cleared cells share the
 * same color, so a "group" is a meaningful unit here) — same
 * treatment the old Hypercube got, unchanged.
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
 * Hyperstar + Laser — convert-and-detonate combo. Cleared cells span
 * whatever colors happened to be under each detonated laser's blast,
 * so (unlike the single-color wipe above) this is scored as a set of
 * INCIDENTAL cells — one flat gem value each — rather than one
 * artificial same-color group.
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
 * Hyperstar + Hyperstar — clears the whole board. Mixed colors, same
 * incidental-cell scoring reasoning as the laser combo above.
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
 * destination cell. Mixed colors along the two lines, so again scored
 * as incidental cells.
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
 * Attempts to swap two adjacent cells: performs the swap, plays the
 * slide animation, then (after the animation finishes) checks what
 * that swap actually did.
 *
 * Checked in this priority order once the swap has landed:
 *   1. Hyperstar + Hyperstar  -> wipe the whole board
 *   2. Hyperstar + Laser      -> convert-and-detonate combo
 *   3. Hyperstar + anything else (normal gem, or a Star gem) -> classic same-color wipe
 *   4. Laser + Laser          -> combined row+column blast at the destination
 *   5. otherwise              -> normal findMatches() check, same as always
 *
 * Cases 1-4 are all swap-ACTIVATED — they happen because of WHAT was
 * swapped together, not because of any pattern the swap happened to
 * form — so none of them ever call findMatches() at all.
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

  // Captured BEFORE the swap: the gem type and special overlay (if
  // any) sitting at each cell. Every combo check below needs to know
  // what was THERE before the swap, since grid/specialGemState have
  // already been swapped by the time this setTimeout runs.
  const preSwapType1 = grid[r1][c1];
  const preSwapType2 = grid[r2][c2];
  const preSwapSpecial1 = specialGemState.grid[r1][c1];
  const preSwapSpecial2 = specialGemState.grid[r2][c2];

  swap(grid, r1, c1, r2, c2);
  swap(specialGemState.grid, r1, c1, r2, c2); // the overlay swaps too, same as any other gem property
  renderBoard(boardEl, grid, onCellClick);
  animateSwap(boardEl, r1, c1, r2, c2, pitch);

  setTimeout(() => {
    const hyperAt1 = preSwapSpecial1 === SPECIAL_GEM_TYPE.HYPERSTAR;
    const hyperAt2 = preSwapSpecial2 === SPECIAL_GEM_TYPE.HYPERSTAR;
    const laserAt1 = preSwapSpecial1 === SPECIAL_GEM_TYPE.LASER_ROW || preSwapSpecial1 === SPECIAL_GEM_TYPE.LASER_COL;
    const laserAt2 = preSwapSpecial2 === SPECIAL_GEM_TYPE.LASER_ROW || preSwapSpecial2 === SPECIAL_GEM_TYPE.LASER_COL;

    // --- case 1: Hyperstar + Hyperstar -> destroy the entire board ---
    if (hyperAt1 && hyperAt2) {
      handleHyperstarDouble();
      return;
    }

    // --- case 2: Hyperstar + Laser -> convert every gem of that
    // color into a laser (random orientation each) and detonate them all ---
    if ((hyperAt1 && laserAt2) || (hyperAt2 && laserAt1)) {
      // The Hyperstar physically ends up at whichever cell it moved
      // INTO after the swap; the color it's paired with is whatever
      // gem sat at the OTHER (laser) cell before the swap happened.
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const laserColorType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarLaserCombo(hyperRow, hyperCol, laserColorType);
      return;
    }

    // --- case 3: Hyperstar + a normal gem (or a Star gem — treated
    // the same way, since neither is a Hyperstar or a Laser) ->
    // classic same-color wipe ---
    if (hyperAt1 || hyperAt2) {
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const targetGemType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarSingle(hyperRow, hyperCol, targetGemType);
      return;
    }

    // --- case 4: Laser + Laser (any orientation combination) ->
    // combined row+column blast ---
    if (laserAt1 && laserAt2) {
      // "the point where it starts is the destination" — use the
      // cell the player swapped INTO (r2, c2) as the single origin
      // for both the row clear and the column clear.
      handleLaserCombo(r2, c2);
      return;
    }

    // --- case 5: nothing special activated by this swap — fall back
    // to the normal match-detection flow, exactly as before ---
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

  const { clearedCells, spawns, matchedGroups, incidentalCells } = resolveSpecialGems(grid, matched);
  applySpawns(spawns);

  const gained = calculateCascadeStepScore({ matchedGroups, incidentalCells, comboCount });
  const comboMessage = comboCount > 1 ? `combo x${comboCount}! ${signed(gained)}` : signed(gained);
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
    renderBoard(boardEl, grid, onCellClick);

    // short cosmetic pause, then check for a cascade
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
  // one card per offered boon
  offer.forEach(def => {
    const card = document.createElement('div');
    card.className = 'boon-card';
    card.innerHTML = `<h3>${def.name}</h3><p>${def.description}</p>`;
    card.addEventListener('click', () => {
      pickBoon(def.id);
      applyBoonEffect(def); // keep whatever your actual line does here
      renderSideStats();    // this pick may have changed a gem's base value/multiplier, its Affinity total, or a global boon total
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

    // THE MISSING LINE — without this, `card` is fully built and
    // wired up but never actually lives in the DOM, so the dialog
    // opens with a title and an empty choices area.
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
  // moves-left loss is shelved behind ENABLE_MOVES_LIMIT — see constants.js
  if (ENABLE_MOVES_LIMIT && moves <= 0) {
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
        // Same "regenerate every usable cell" logic a boon placement uses
        // (see rebuildGridRespectingBlocked() in tiles.js) — but a
        // deadlock reshuffle, unlike a boon placement, wipes ALL special
        // gems (resetSpecialGems()) rather than keeping them, since the
        // whole point here is "nothing on this board works anymore."
        rebuildGridRespectingBlocked(grid);
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

applyStaticText();
applyMovesLimitVisibility(); 
showStartScreen();