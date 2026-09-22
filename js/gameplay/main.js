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

// --- imports from gameplay ---
import {
  SIZE, findMatches, hasAnyMatch,
  hasPossibleMove, swap, collapseAndFill,
  BLOCKED, findHintMove
} from './board.js';

import { resetBoons, generateBoonOffer, pickBoon } from './boon.js';
import { applyBoonEffect, resetBoonEffects } from './boon_effects.js';

import {
  rollBoonShopOffer, isBoonPurchasedThisVisit, markBoonPurchased,
  calculateBoonPrice, shopTierForLevel, resetBoonShop,
} from './boon_shop.js';

import { getGemBaseScore, getGemBaseMultiplier } from './gem_base.js';
import { addHistoryEntry, resetHistory } from './history.js';

import { resetProgression, advanceLevel } from './progression.js';

import {
  renderBoard, updateSelectedVisual, markMatchedGems,
  computeCellPitch, animateSwap, showHintHighlight
} from './render.js';

import { calculateCascadeStepScore, getMatchBonusForGem } from './score.js';
import { shouldOpenShop, resetShop } from './shop.js';

import {
  resolveSpecialGems, applySpawns, clearSpecialGems, resetSpecialGems,
  triggerHyperstarSingle, triggerHyperstarLaserCombo, triggerHyperstarDouble, triggerLaserCombo,
  triggerHyperstarDischargerCombo, triggerDischargerLaserCombo, triggerDischargerDouble,
} from './special_gem.js';

import {
  expandBoard, shrinkBoard, resetTiles,
  getExpandableCells, rebuildGridRespectingBlocked,
} from './tiles.js';

// --- imports from resources ---
import { 
  DEFAULT_GEM_BASE_SCORE, DEFAULT_GEM_BASE_MULTIPLIER 
} from '../resources/base%20value/base_score.js';

import { BOON_TYPE } from '../resources/boon/boon.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';

import {
  PREVENT_DEADLOCK, DEFAULT_SCORE, SWAP_ANIM_MS, MATCH_CLEAR_DELAY_MS,
  CASCADE_CHECK_DELAY_MS, LEVEL_UP_BONUS_MOVES, ENABLE_MOVES_LIMIT, SCORE_POPUP_MS,
  NO_MOVES_GAME_OVER_DELAY_MS, HINT_DELAY_MS,
  TILE_SHAPES, GEM_DEFINITIONS, ALL_GEM_CATALOG
} from '../resources/constant/constants.js';

import {
  GAME_NAME, GAME_TAGLINE, BUTTONS, DIALOG_TITLES, MESSAGES, GAME_VERSION
} from '../resources/constant/text.js';

import { historyState } from '../resources/history/history_state.js';
import { boonShopState } from '../resources/shop/boon_shop_state.js';
import { SPECIAL_GEM_TYPE } from '../resources/special%20gem/special_gem.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';
import { progressionState } from '../resources/progression/progression.js';

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

const historyListEl = document.getElementById('history-list');
const shopDialogEl    = document.getElementById('shop-dialog');
const shopTitleEl     = document.getElementById('shop-title');
const shopSubtitleEl  = document.getElementById('shop-subtitle');
const shopChoicesEl   = document.getElementById('shop-choices');
const shopLeaveBtn    = document.getElementById('shop-leave');

const versionTagEl = document.getElementById('version-tag');

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
// Set by openShopDialog(); holds the "resume whatever was paused for
// the shop" callback, invoked once the player clicks Leave. Same
// stash-a-callback pattern showLevelUpDialog()/showBoonDialog() use.
let shopContinuation = null;
// Which shop tier is currently open — set once when the shop opens,
// read by renderShopDialog() for every card's price. Doesn't change
// mid-visit.
let currentShopTier = 1;
// NEW — the player's score at the MOMENT the shop opened, snapshotted
// once. Every card's price is based on THIS, not the live `score`
// variable — otherwise buying one boon would lower `score`, which
// would immediately cheapen every other card still on the shelf
// (since price includes a rarity% x score term). Reset to 0 mainly
// for tidiness; it's always overwritten by openShopDialog() before
// renderShopDialog() ever reads it.
let shopEntryScore = 0;

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
  shopTitleEl.textContent = DIALOG_TITLES.SHOP;       // NEW
  shopLeaveBtn.textContent = BUTTONS.LEAVE_SHOP;      // NEW
  versionTagEl.textContent = GAME_VERSION; // NEW
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
 * matching bonus (Affinity + Frenzy combined — see score.js's
 * getMatchBonusForGem()), base score, and base multiplier, plus the
 * two global boon totals.
 *
 * The ONLY things that can change any of these numbers are boon
 * picks (Affinity/Bounty/Brilliance/Lush/Frenzy/Enthusiast/Addict/
 * Maniac/Fanatic, and the 4 global boons) — so this only needs to run
 * once in init() and again right after applyBoonEffect(), not on
 * every score change.
 *
 * Only the 7 ACTIVE gems are shown (GEM_DEFINITIONS) — the 4
 * locked/future gems (Onyx etc.) can still quietly accumulate Lush/
 * Maniac penalties in gemBaseState, but showing that here would just
 * be confusing before they're actually unlockable.
 *
 * Each row's "match" stat carries a small gem icon inline (the same
 * svg render.js uses for the board itself). Every number shown here
 * — the two global stats and all three per-gem stats — is also
 * colored relative to its OWN no-boon default (see statDiffClass()):
 * green once a boon has pushed it up, red once a boon has pulled it
 * down, left alone if nothing's touched it.
 *
 * @returns {void}
 */
function renderSideStats() {
  globalMultiplierEl.textContent = `${boonEffectState.globalScoreMultiplier.toFixed(2)}x`;
  globalBonusEl.textContent = signed(boonEffectState.globalScoreBonus);
  // Global multiplier's no-boon default is 1.0x; global bonus's is +0.
  // className is fully overwritten (not just toggled) each render, so
  // there's no risk of a stale boosted/penalized class lingering from
  // a previous boon pick.
  globalMultiplierEl.className = `side-stat-value ${statDiffClass(boonEffectState.globalScoreMultiplier, 1.0)}`;
  globalBonusEl.className = `side-stat-value ${statDiffClass(boonEffectState.globalScoreBonus, 0)}`;

  // Rebuilt from scratch every call — cheap at 7 rows, and much
  // simpler than diffing individual rows in place.
  gemStatsListEl.innerHTML = '';

  GEM_DEFINITIONS.forEach(({ id, name, file }) => {
    const baseScore = getGemBaseScore(id);
    const baseMultiplier = getGemBaseMultiplier(id);
    // Combines Affinity's flat bonus with every active Frenzy pick's
    // bonus/penalty for this specific gem — this is what fixes
    // Frenzy never showing up here (it used to only read
    // boonEffectState.affinityBonus directly, which Frenzy never
    // touches).
    const matchBonus = getMatchBonusForGem(id);

    // Each stat's color is relative to ITS OWN no-boon default: base
    // score defaults to 10, base multiplier to 1.0, match bonus to 0
    // (no Affinity/Frenzy picked for this gem at all).
    const baseScoreClass = statDiffClass(baseScore, DEFAULT_GEM_BASE_SCORE);
    const baseMultiplierClass = statDiffClass(baseMultiplier, DEFAULT_GEM_BASE_MULTIPLIER);
    const matchBonusClass = statDiffClass(matchBonus, 0);

    const row = document.createElement('div');
    row.className = 'gem-stat-row';
    row.innerHTML = `
      <div class="gem-stat-name"><img class="gem-stat-icon" src="css/model/svg/${file}" alt="${name}">${name}</div>
      <div class="gem-stat-values">
        <span class="${baseScoreClass}">base ${baseScore}</span>
        <span class="${baseMultiplierClass}">x${baseMultiplier.toFixed(2)}</span>
        <span class="gem-stat-bonus ${matchBonusClass}">match ${signed(matchBonus)}</span>
      </div>
    `;
    gemStatsListEl.appendChild(row);
  });
}

/**
 * Rebuilds the right-side History panel from historyState.entries.
 *
 * Newest entries are shown at the TOP of the list (reverse
 * chronological) — a running combat log reads better with the
 * latest line front-and-center than making the player scroll down
 * every time something new happens.
 *
 * Colors each line via a CSS class off its stored `tone`: green
 * ('positive'), red ('negative'), or the panel's normal dim color
 * ('neutral' — no extra class needed, it just inherits).
 *
 * Called every time a new entry is pushed (see the addHistoryEntry()
 * call sites below) — cheap at a max of MAX_HISTORY_ENTRIES (200)
 * short rows, same "just rebuild it from scratch" approach
 * renderSideStats() already uses.
 *
 * @returns {void}
 */
function renderHistoryPanel() {
  historyListEl.innerHTML = '';
  // .slice().reverse() so historyState.entries ITSELF stays
  // oldest-first (natural push order, easiest to reason about) —
  // only the DISPLAY is newest-first.
  historyState.entries.slice().reverse().forEach(entry => {
    const row = document.createElement('div');
    row.className = `history-entry history-entry--${entry.tone}`;
    row.textContent = entry.text;
    historyListEl.appendChild(row);
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
 * NEW — the isExcluded predicate for board.js's findMatches()/
 * hasPossibleMove()/findHintMove(): true for any cell currently
 * holding a Hyperstar. A Hyperstar is swap-activated ONLY (see
 * special_gem.js's resolveSpecialGems() dispatch — it deliberately
 * has no passive-match case) — but without this, findMatches() would
 * still happily sweep a Hyperstar's cell into an adjacent plain-color
 * run purely because its underlying grid[][] value still matches
 * that color, silently destroying it as a "bonus matched gem"
 * instead of leaving it on the board to be triggered by an actual
 * swap combo. Laser/Discharger are deliberately NOT excluded here —
 * being swept into a normal match (or a chain-reaction blast) is how
 * THEIR passive effect is meant to trigger; only Hyperstar needs to
 * stand apart.
 *
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isHyperstarCell(row, col) {
  return specialGemState.grid[row][col] === SPECIAL_GEM_TYPE.HYPERSTAR;
}

/**
 * NEW — the isSpecialSwap predicate for board.js's hasPossibleMove()/
 * findHintMove(): true if swapping (r1,c1) with (r2,c2) is legal
 * purely because of what's sitting in those two cells, independent of
 * any color match. Mirrors attemptSwap()'s own case-1-through-7
 * dispatch order exactly:
 *   - either cell is a Hyperstar -> ALWAYS legal (covers cases 1-4:
 *     Hyperstar+Hyperstar, Hyperstar+Laser, Hyperstar+Discharger,
 *     Hyperstar+plain gem — a Hyperstar swap is never "invalid").
 *   - neither is a Hyperstar, but BOTH cells hold some special gem
 *     (so some Laser/Discharger combination) -> ALWAYS legal too
 *     (covers cases 5-7: Laser+Laser, Discharger+Laser either way,
 *     Discharger+Discharger).
 *   - anything else (a lone Laser/Discharger next to a plain gem, or
 *     two plain gems) -> not a guaranteed move; falls through to the
 *     normal findMatches() color-match check instead.
 *
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @returns {boolean}
 */
function isSpecialSwapPair(r1, c1, r2, c2) {
  const a = specialGemState.grid[r1][c1];
  const b = specialGemState.grid[r2][c2];

  if (a === SPECIAL_GEM_TYPE.HYPERSTAR || b === SPECIAL_GEM_TYPE.HYPERSTAR) return true;

  // Neither is a Hyperstar — legal only if BOTH sides are some special
  // gem (both truthy). A single special next to a plain gem is NOT
  // automatically legal — that's a normal swap that still needs an
  // actual color match to succeed.
  return !!a && !!b;
}

/**
 * Builds the History/popup text for one cascade STEP resolved via the
 * normal match-detection path (resolveMatches()) — NOT the
 * swap-activated special-gem combos, which build their own dedicated
 * "<Combo Name>: <score>" text at their own call sites (see the
 * handleXXX functions below).
 *
 * Format:
 *   - Single formed match:      "Match 3 Amethyst: +80"
 *   - Multiple simultaneous
 *     formed matches:           "Match 3 Amethyst + Match 4 Ruby: +215"
 *   - Any blast-chained
 *     (incidental) cells
 *     riding along this step:   "...+ Chain Reaction (5 gems): +215"
 *   - A combo step (2nd+ link
 *     in one cascade):          "Combo x2: Match 3 Ruby: +140"
 *
 * @param {{gemType: number, length: number}[]} matchedGroups
 * @param {{gemType: number, row: number, col: number}[]} incidentalCells
 * @param {number} comboCount
 * @param {number} gained
 * @returns {string}
 */
function buildMatchMessage(matchedGroups, incidentalCells, comboCount, gained) {
  // One "Match N GemName" fragment per formed group this step —
  // usually just one, but two separate matches CAN complete on the
  // same board update (e.g. a cascade's fall completing two
  // unrelated runs at once).
  const matchParts = matchedGroups.map(({ gemType, length }) => {
    const gemName = GEM_DEFINITIONS[gemType]?.name ?? 'Gem';
    return `Match ${length} ${gemName}`;
  });

  // A chain-reaction (an EXISTING special gem's blast triggering as
  // part of this same step) gets its own fragment rather than being
  // silently folded into the score with no mention at all.
  if (incidentalCells.length > 0) {
    matchParts.push(`Chain Reaction (${incidentalCells.length} gems)`);
  }

  // Shouldn't normally happen (a scored step always has SOME cleared
  // cells) but guards against printing "undefined: +80".
  const body = matchParts.length > 0 ? matchParts.join(' + ') : 'Match';

  const prefix = comboCount > 1 ? `Combo x${comboCount}: ` : '';
  return `${prefix}${body}: ${signed(gained)}`;
}

/**
 * Picks the CSS class that colors a side-stat value relative to its
 * OWN no-boon default: green (gem-stat-boosted) if a boon has pushed
 * it above that default, red (gem-stat-penalized) if a boon has
 * pulled it below, or '' (leave the row's normal color alone) if
 * nothing's touched it yet. Shared by every stat shown in the side
 * panel — each caller just passes in its own no-boon default (10 for
 * base score, 1.0 for base multiplier, 0 for match bonus / global
 * bonus, 1.0 for global multiplier).
 *
 * @param {number} value - the stat's current (boon-adjusted) value.
 * @param {number} defaultValue - what the stat would be with no boons picked at all.
 * @returns {string} a CSS class name, or '' for "unchanged from default."
 */
function statDiffClass(value, defaultValue) {
  if (value > defaultValue) return 'gem-stat-boosted';
  if (value < defaultValue) return 'gem-stat-penalized';
  return '';
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
  const move = findHintMove(grid, isHyperstarCell, isSpecialSwapPair);
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
  resetProgression(1);
  resetBoons();
  resetTiles();
  resetSpecialGems();
  resetHistory(); // NEW — clears the panel's backing list for a fresh run
  resetShop(); // NOTE: only if you've already wired this from the old shop system — otherwise skip
  resetBoonShop();

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

  shopDialogEl.classList.add('hidden');
  shopContinuation = null;

  renderSideStats(); // reflect the freshly-reset boon/gem state
  renderBoardWithInteractions();
  renderHistoryPanel(); // NEW — clears the panel's DOM to match the reset list
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
 * NEW — every call now also logs a line into the History panel: the
 * exact same text that would show in the floating score popup, PLUS
 * a separate "level cleared" line if this gain crossed one or more
 * targets. This runs regardless of whether the popup actually shows
 * (it doesn't, on a level-up — the dialog covers the screen instead)
 * so the history panel always has the full record even for moments
 * the popup itself skips.
 *
 * Does NOT show the level-up dialog itself — callers decide WHEN via
 * `pendingLevelUp`, so a cascade can keep running after crossing a
 * target instead of being interrupted mid-chain-reaction.
 *
 * @param {number} gained - score to add.
 * @param {string} popupText - text to float above the board if this
 *   gain DIDN'T level up (and, now, the text logged to History either way).
 * @returns {boolean} true if at least one level was cleared.
 */
function applyScoreGain(gained, popupText) {
  score += gained;
  scoreEl.textContent = score;

  // Snapshot BEFORE the while loop below, so a single huge gain that
  // happens to cross more than one level's target at once can still
  // report the whole span in its history line, not just "the last one."
  const levelBeforeGain = progressionState.level;

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

  // NEW — log this gain into the History panel. Tone is derived
  // straight from the sign of `gained`: a Frenzy/Lust-type penalty
  // can legitimately make a cascade step's total negative, and that
  // should read as a red line just like an invalid outcome would.
  const tone = gained > 0 ? 'positive' : gained < 0 ? 'negative' : 'neutral';
  addHistoryEntry('score', popupText, tone);

  if (leveledUp) {
    levelEl.textContent = progressionState.level;
    targetEl.textContent = progressionState.scoreTarget;
    movesEl.textContent = moves;
    // The level-up dialog is about to cover the screen — blank the
    // status line so it doesn't show a stale prompt underneath it.
    messageEl.textContent = '';

    // NEW — a level-up gets its OWN follow-up history line, separate
    // from the score-gain line just above. Handles clearing more than
    // one level in a single gain (a big enough cascade/global-boost
    // total COULD cross more than one target at once).
    const clearedLabel = progressionState.level - levelBeforeGain > 1
      ? `Level ${levelBeforeGain}-${progressionState.level - 1}`
      : `Level ${levelBeforeGain}`;
    addHistoryEntry('score', `${clearedLabel} cleared! Moving to Level ${progressionState.level}.`, 'levelup');
  } else {
    // NEW — score deltas float above the board instead of appearing
    // in the #message line.
    showScorePopup(popupText);
  }
  renderHistoryPanel();

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
 * FIXED — the Hyperstar's own cell used to get folded into the
 * targetGemType matched-group's `length`, which scored IT using the
 * WIPED color's base value/multiplier instead of its own (whatever
 * color the Hyperstar itself actually happened to be sitting on).
 * Now it's pulled out and scored separately, as its own incidental
 * cell, using its real underlying gem type — same treatment any
 * other incidentally-cleared cell gets.
 *
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} targetGemType
 * @returns {void}
 */
function handleHyperstarSingle(hyperRow, hyperCol, targetGemType) {
  const clearedCells = triggerHyperstarSingle(grid, hyperRow, hyperCol, targetGemType);

  // Read the Hyperstar's OWN underlying color BEFORE anything gets
  // nulled out later — it's whatever gem type it was born from, not
  // necessarily (and generally not) targetGemType.
  const hyperstarOwnGemType = grid[hyperRow][hyperCol];

  // Strip the Hyperstar's own cell out of the wipe count so the
  // matched-group length reflects ONLY cells that are genuinely that
  // color — otherwise every wipe over-counted by exactly 1 cell of
  // the wrong color.
  const wipedCells = clearedCells.filter(([r, c]) => !(r === hyperRow && c === hyperCol));

  const gained = calculateCascadeStepScore({
    matchedGroups: [{ gemType: targetGemType, length: wipedCells.length }],
    // The Hyperstar's own cell scores as one flat incidental hit for
    // ITS OWN gem — it was never actually part of the wiped color.
    incidentalCells: [{ gemType: hyperstarOwnGemType, row: hyperRow, col: hyperCol }],
    comboCount: 1,
  });
  finishSwapActivatedCombo(clearedCells, gained, `Hyperstar Wipe: ${signed(gained)}`);
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
  finishSwapActivatedCombo(clearedCells, gained, `Hyperstar Laser Combo: ${signed(gained)}`);
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
  finishSwapActivatedCombo(clearedCells, gained, `Hyperstar Discharger Combo: ${signed(gained)}`);
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
  finishSwapActivatedCombo(clearedCells, gained, `Double Hyperstar: ${signed(gained)}`);
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
  finishSwapActivatedCombo(clearedCells, gained, `Laser Combo: ${signed(gained)}`);
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
  finishSwapActivatedCombo(clearedCells, gained, `Discharger Laser Combo: ${signed(gained)}`);
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
  finishSwapActivatedCombo(clearedCells, gained, `Double Discharger: ${signed(gained)}`);
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
    const matched = findMatches(grid, isHyperstarCell);

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
    // Pass this swap's two cells through so THIS FIRST cascade step
    // can spawn any resulting special gem at whichever swapped cell
    // ended up part of the match, instead of the old fixed
    // middle/intersection rule.
    resolveMatches([[r1, c1], [r2, c2]]);
  }, SWAP_ANIM_MS);
}

/**
 * Recursive-by-timeout loop: pop current matches, award combo-scaled
 * score, check for a level-up, collapse+refill, then check for new
 * matches caused by the fall (cascades). Repeats until the board is
 * stable, then hands off to checkEndState().
 *
 * @param {[[number, number], [number, number]] | null} [swapCells] -
 *   the two cells the player just swapped, ONLY on the very first
 *   call following a real swap (see attemptSwap()'s fallback branch —
 *   the ONLY call site that ever passes this). Every deeper cascade
 *   link is scheduled via `setTimeout(resolveMatches, ...)` with no
 *   arguments, so it naturally defaults back to null here — a
 *   gravity-caused cascade link has no "swap" to speak of, so it
 *   always falls back to the old middle/intersection spawn rule (see
 *   special_gem.js's classifyGroup()/pickSpawnCell()).
 * @returns {void}
 */
function resolveMatches(swapCells = null) {
  const matched = findMatches(grid, isHyperstarCell);

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

  const { clearedCells, spawns, matchedGroups, incidentalCells } = resolveSpecialGems(grid, matched, swapCells);
  applySpawns(spawns);

  const gained = calculateCascadeStepScore({ matchedGroups, incidentalCells, comboCount });
  const matchMessage = buildMatchMessage(matchedGroups, incidentalCells, comboCount, gained);
  const leveledUp = applyScoreGain(gained, matchMessage);

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

      // NEW — record the pick in the History panel. Tone follows the
      // boon's OWN type rather than trying to re-derive positive/
      // negative from its numbers: a RISKY_BUFF (Frenzy, the 4 global
      // boons) always carries BOTH an upside and a downside at once,
      // so no single sign correctly describes it — those stay
      // 'neutral'. CURSE (currently only the board-shrink boon) is a
      // pure downside. Plain BUFF is a pure upside.
      const boonTone = def.type === BOON_TYPE.CURSE ? 'negative'
        : def.type === BOON_TYPE.BUFF ? 'positive'
        : 'neutral';
      // CHANGED — boon picks always use their own dedicated 'boon'
      // tone/color now (violet), instead of borrowing score's
      // green/red off BOON_TYPE. Reusing green/red made a buff pick
      // visually indistinguishable from a plain positive score line —
      // the boon's own name/description already say buff-vs-curse;
      // the color now just marks "this line is a boon pick," free or
      // bought alike (see buyBoonFromShop() below).
      addHistoryEntry('boon', `Boon picked: ${def.name} — ${def.description}`, 'boon');
      renderHistoryPanel();

      proceedAfterBoonPick(def, onContinue);
    });

    boonChoicesEl.appendChild(card);
  });

  boonDialogEl.classList.remove('hidden');
}

/**
 * Decides what happens immediately after a FREE level-up boon has
 * been picked and applied: open the shop (if the level just cleared
 * is a multiple of SHOP_LEVEL_INTERVAL), then — either way — run
 * whatever board-shape placement or cascade-resume step was already
 * queued up behind the boon pick.
 *
 * Order: free pick always happens first, the shop (if any) opens
 * second, and any board-shape placement for THIS boon runs last,
 * once the shop is closed.
 *
 * @param {object} def - the boon just picked (from the free dialog).
 * @param {() => void} onContinue - what resolveMatches()'s deferred
 *   level-up flow is ultimately waiting to run once everything is done.
 * @returns {void}
 */
function proceedAfterBoonPick(def, onContinue) {
  const isBoardShapeBoon =
    def.effect.kind === 'board_expand' ||
    def.effect.kind === 'board_shrink' ||
    def.effect.kind === 'board_expand_and_shrink';

  const afterShop = () => {
    if (isBoardShapeBoon) {
      startTilePlacement(def, onContinue);
    } else {
      onContinue();
    }
  };

  // progressionState.level has ALREADY advanced (advanceLevel() runs
  // inside applyScoreGain(), well before the boon dialog opens) — so
  // "the level that was just cleared" is level - 1, not the current
  // level. shouldOpenShop() checks THAT cleared level against the
  // every-5 cadence.
  const levelJustCleared = progressionState.level - 1;
  if (shouldOpenShop(levelJustCleared)) {
    openShopDialog(afterShop);
  } else {
    afterShop();
  }
}

/**
 * Opens the boon shop: rolls a fresh offer and shows the dialog.
 * Stashes `onContinue` so Leave can resume whatever was paused.
 *
 * @param {() => void} onContinue
 * @returns {void}
 */
function openShopDialog(onContinue) {
  currentShopTier = shopTierForLevel(progressionState.level - 1);
  // Snapshot score HERE, once, before any purchase can happen this
  // visit — the shop's "Your score" subtitle never changes mid-visit, 
  // even if the player buys something and the score drops.
  shopEntryScore = score;
  rollBoonShopOffer();
  shopContinuation = onContinue;
  renderShopDialog();
  shopDialogEl.classList.remove('hidden');
}

/**
 * Rebuilds the shop's card grid from boonShopState.offer, from
 * scratch, every time — same "just rebuild it" convention as
 * renderSideStats()/renderHistoryPanel(). Called on open and again
 * after every purchase (price never changes mid-visit, but a card's
 * bought/affordable state does).
 *
 * @returns {void}
 */
function renderShopDialog() {
  shopSubtitleEl.textContent = `Your score: ${score}`;
  shopChoicesEl.innerHTML = '';

  boonShopState.offer.forEach(def => {
    const price = calculateBoonPrice(def.rarity, currentShopTier, shopEntryScore);
    const alreadyBought = isBoonPurchasedThisVisit(def.id);
    const canAfford = score >= price;

    const card = document.createElement('div');
    card.className = 'shop-card';
    if (alreadyBought) card.classList.add('shop-card--bought');
    else if (!canAfford) card.classList.add('shop-card--unaffordable');

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
      <div class="shop-card-price">${alreadyBought ? 'Purchased' : `${price} pts`}</div>
    `;

    // Only wire a click when the card is actually purchasable — an
    // already-bought or too-expensive card is inert (styled via the
    // classes above instead of a disabled-button affordance).
    if (!alreadyBought && canAfford) {
      card.addEventListener('click', () => buyBoonFromShop(def, price));
    }

    shopChoicesEl.appendChild(card);
  });
}

/**
 * Attempts to buy one boon from the current shop offer: deducts its
 * price from score, then calls the EXACT same pickBoon()/
 * applyBoonEffect() pair the free level-up dialog uses, so a bought
 * boon counts against that boon's maxOccurrences cap exactly like a
 * free one would.
 *
 * @param {object} def - the BOON_POOL entry being bought.
 * @param {number} price - its price, exactly as shown on the card
 *   (recomputed by the caller, not trusted from a stale click event).
 * @returns {void}
 */
function buyBoonFromShop(def, price) {
  if (score < price) return; // safety net — card shouldn't be clickable here at all

  score -= price;
  scoreEl.textContent = score;

  pickBoon(def.id);
  applyBoonEffect(def);
  markBoonPurchased(def.id);

  // Reuses the same 'boon' tone the free pick uses, so the log reads
  // as one consistent timeline regardless of free-vs-bought.
  addHistoryEntry('boon', `Bought from shop: ${def.name} (-${price}) — ${def.description}`, 'boon');
  renderHistoryPanel();

  renderSideStats();
  renderShopDialog(); // reflect the new score + this card's bought state
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

  if (!hasPossibleMove(grid, isHyperstarCell, isSpecialSwapPair)) {
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
shopLeaveBtn.addEventListener('click', () => {
  shopDialogEl.classList.add('hidden');
  const finish = shopContinuation;
  shopContinuation = null;
  if (finish) finish();
});

applyStaticText();
applyMovesLimitVisibility(); 
showStartScreen();