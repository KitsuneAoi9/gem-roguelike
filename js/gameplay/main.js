// ============================================================
// MAIN.JS — entry point and game loop.
//
// Owns all mutable game state (grid, score, moves, selection) and
// decides *when* things happen. board.js decides *what's legal*,
// render.js decides *how it looks*. This file should stay thin —
// if logic is getting complicated, it probably belongs in board.js.
//
// This is the fully consolidated version covering everything from
// this session:
//   - Obsidian gem: click/drag guards, "falls off the board" cleanup.
//   - Dice reworked into a targeted 3x3 tool.
//   - Frantic Star's extra-target wipe + self-activation check.
//   - Warmonger/Adventure Junkie's struck-through decline buttons.
//   - Decaying Birthstone's lethal check.
//   - Perpetual Boon's per-level gain.
//   - Event dialog titles now read "[Type] --- [Name]".
//   - The Challenge engine: multi-level (Silent Vein), a recurring
//     score decay + a 5-minute time limit (A Test of Endurance).
//   - Overcharge Essence's per-level gem conversion.
//   - Resurrection Cross rework: an informational message, or a
//     Yes/No "try a consumable first?" dialog.
//   - Booner's stacking chance of a bonus boon offer.
//   - VIP Membership Card's 10% shop discount.
//   - The Customer Service shop section (Curse Removal Service,
//     Limited Edition Boons Sale Service).
//   - Shop redesign: boon cards now reuse the level-up dialog's
//     `.boon-card` styling; consumables render as belt-style squares.
// ============================================================

// --- imports from gameplay ---
import {
  SIZE, findMatches, hasAnyMatch,
  hasPossibleMove, swap, collapseAndFill,
  BLOCKED, OBSIDIAN, findHintMove
} from './board.js';

import { settleObsidianOffBoard } from './obsidian.js';

import { resetBoons, generateBoonOffer, pickBoon, isBoonActive, countActiveBoon } from './boon.js';
import { applyBoonEffect, resetBoonEffects } from './boon_effects.js';

import {
  rollBoonShopOffer, isBoonPurchasedThisVisit, markBoonPurchased,
  calculateBoonPrice, shopTierForLevel, resetBoonShop,
} from './boon_shop.js';

import {
  addConsumableToInventory, removeConsumableFromInventory, findFirstConsumableOfType,
  hasBeltSpace, resetConsumables, triggerPickaxe, triggerDynamite, triggerDiceShuffleArea,
  triggerMagicalGloveSwap,
} from './consumable.js';
import {
  rollConsumableShopOffer, calculateConsumablePrice, isConsumablePurchasedThisVisit,
  markConsumablePurchased, resetConsumableShop,
} from './consumable_shop.js';
import { resetCurses, getActiveCurseDefsByKind, recordDecayingBirthstoneActivity } from './curse.js';
import {
  tryTriggerEvent, buildEncounterOffer, resolveEncounterAccept, resolveEncounterDecline,
  pickEliteDef, startEliteFight, declineElite, resolveEliteOutcome, getEliteProgressInfo,
  pickChallengeDef, startChallenge, declineChallenge, markChallengeDetonation,
  checkChallengeLevelClear, applyChallengeDecayIfDue, getActiveChallengeDef, resetEvents,
  placeFortunesFollyBet, flipFortunesFollyDoubleOrNothing, payFortunesFollyAndLeave,
  resolveLostMinerHelp, resolveLostMinerAbsorb,
  resolveMeditatingElfSteal, resolveChestOpen,
  recordEliteGemActivity,
  formatNamedEffectSpan,
} from './event.js';

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
  triggerHyperstarSelfActivation, convertRandomPlainGemsToSpecial, expandChainReaction,
} from './special_gem.js';

import {
  expandBoard, shrinkBoard, resetTiles,
  getExpandableCells, rebuildGridRespectingBlocked,
} from './tiles.js';

// --- NEW — Customer Service ---
import {
  calculateCurseRemovalPrice, removeCurseViaService, rollLimitedEditionBoonOffer,
  markCustomerServiceUsed, resetCustomerServiceVisit, resetCustomerService,
} from './customer_service.js';
import { customerServiceState } from '../resources/shop/customer_service_state.js';

// --- imports from resources ---
import {
  DEFAULT_GEM_BASE_SCORE, DEFAULT_GEM_BASE_MULTIPLIER
} from '../resources/base%20value/base_score.js';

import { BOON_TYPE, BOON_POOL } from '../resources/boon/boon.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import { boonState } from '../resources/boon/boon_state.js';

import {
  PREVENT_DEADLOCK, DEFAULT_SCORE, SWAP_ANIM_MS, MATCH_CLEAR_DELAY_MS,
  CASCADE_CHECK_DELAY_MS, LEVEL_UP_BONUS_MOVES, ENABLE_MOVES_LIMIT, SCORE_POPUP_MS,
  NO_MOVES_GAME_OVER_DELAY_MS, HINT_DELAY_MS,
  TILE_SHAPES, GEM_DEFINITIONS, ALL_GEM_CATALOG
} from '../resources/constant/constants.js';

import { CURSE_POOL } from '../resources/curse/curse.js';
import { curseState } from '../resources/curse/curse_state.js'; // NEW — needed for the curse-removal picker list
import { EVENT_TYPE } from '../resources/event/event.js';
import { activeEventState } from '../resources/event/event_state.js';

import {
  GAME_NAME, GAME_TAGLINE, BUTTONS, DIALOG_TITLES, MESSAGES, GAME_VERSION
} from '../resources/constant/text.js';

import { historyState } from '../resources/history/history_state.js';
import { boonShopState } from '../resources/shop/boon_shop_state.js';
import { consumableShopState } from '../resources/shop/consumable_shop_state.js';
import { SPECIAL_GEM_TYPE } from '../resources/special%20gem/special_gem.js';
import { specialGemState } from '../resources/special%20gem/special_gem_state.js';
import { progressionState } from '../resources/progression/progression.js';

import { CONSUMABLE_INFO, CONSUMABLE_TYPE, GOLDEN_TICKET_TURNS } from '../resources/consumable/consumable.js';
import { consumableState } from '../resources/consumable/consumable_state.js';

// The belt types that actually change the board layout (Pickaxe/
// Dynamite/Dice), as opposed to Golden Ticket (a pure score buff) or
// the Resurrection Cross itself (passive).
const BOARD_CHANGING_CONSUMABLE_TYPES = [
  CONSUMABLE_TYPE.PICKAXE,
  CONSUMABLE_TYPE.DYNAMITE,
  CONSUMABLE_TYPE.DICE,
  CONSUMABLE_TYPE.MAGICAL_GLOVE,
];

// NEW — every event dialog's title now reads "[Event type] --- [Event
// name]" (e.g. "Elite --- The Gem Cultivator") instead of just the
// bare event name.
const EVENT_TYPE_LABEL = {
  [EVENT_TYPE.ENCOUNTER]: 'Encounter',
  [EVENT_TYPE.ELITE]: 'Elite',
  [EVENT_TYPE.CHALLENGE]: 'Challenge',
};

/**
 * Builds the shared "[Event type] --- [Event name]" title format used
 * by every event dialog.
 *
 * @param {string} type - an EVENT_TYPE value.
 * @param {string} name - the specific event def's own name.
 * @returns {string}
 */
function formatEventTitle(type, name) {
  return `${EVENT_TYPE_LABEL[type] || ''} --- ${name}`;
}

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
const boonSkipBtn     = document.getElementById('boon-skip');
const globalMultiplierEl = document.getElementById('global-multiplier');
const globalBonusEl      = document.getElementById('global-bonus');
const gemStatsListEl     = document.getElementById('gem-stats-list');
const targetMultiplierEl = document.getElementById('target-multiplier');
const curseListEl        = document.getElementById('curse-list');

const historyListEl = document.getElementById('history-list');
const shopDialogEl    = document.getElementById('shop-dialog');
const shopTitleEl     = document.getElementById('shop-title');
const shopSubtitleEl  = document.getElementById('shop-subtitle');
const shopChoicesEl   = document.getElementById('shop-choices');
const shopLeaveBtn    = document.getElementById('shop-leave');
const customerServiceChoicesEl = document.getElementById('customer-service-choices'); // NEW

const versionTagEl = document.getElementById('version-tag');

const movesStatEl = document.getElementById('moves-stat');

const objectiveBannerEl = document.getElementById('objective-banner');
const objectiveTextEl   = document.getElementById('objective-text');

const eventDialogEl   = document.getElementById('event-dialog');
const eventTitleEl    = document.getElementById('event-title');
const eventStoryEl    = document.getElementById('event-story');
const eventChoicesEl  = document.getElementById('event-choices');

const beltSlotEls = document.querySelectorAll('#consumable-belt .belt-slot');
const goldenTicketStatusEl = document.getElementById('golden-ticket-status');
const consumableShopChoicesEl = document.getElementById('consumable-shop-choices');

const deadlockDialogEl   = document.getElementById('deadlock-dialog');
const deadlockMessageEl  = document.getElementById('deadlock-message');
const deadlockYesBtn     = document.getElementById('deadlock-yes');
const deadlockNoBtn      = document.getElementById('deadlock-no');

// --- mutable game state ---
let grid;
let score;
let moves;
let selected;
let placementMode;
let placementShape;
let tilePlacementQueue = [];
let tilePlacementFinalContinuation = null;
let busy;
let comboCount;

let scorePopupHideTimeout = null;
let pendingContinuation = null;
let pendingLevelUp = false;
let hintTimeoutId = null;
let shopContinuation = null;
let shopOpenedForLevel = null; // Guards against the shop opening twice for the SAME cleared level.
let currentShopTier = 1;
let shopEntryScore = 0;
let objectiveIntervalId = null;
let pendingEventResult = null;
let pendingConsumableEntry = null;
let pendingGoldenTicketTurn = false;
let goldenTicketTurnsRemaining = 0;

// NEW — every level cleared by the current chain of score gains, in
// order (e.g. [6,7,8,9,10] after a jump from 6 to 11). Filled by
// applyScoreGain(), drained one entry at a time by runLevelUpQueue().
let pendingClearedLevels = [];

// NEW — which cleared level the CURRENTLY-shown level-up dialog /
// boon dialog / shop is for. The Next Level button listener reads it.
let pendingLevelUpClearedLevel = 1;

// NEW — true while the Customer Service section is showing the
// "select a curse to remove" list instead of its normal two cards.
let curseRemovalPickerOpen = false;

// The two cells of the swap currently being resolved (post-swap
// positions). Their specials already activated, so chain reactions skip them.
let currentSwapKeys = new Set();

// NEW — Magical Glove's two-click flow: the first gem the player picked
// ([row, col]), or null while still waiting for that first click.
let gloveSource = null;

/**
 * Sets every bit of static, non-runtime-dependent text.
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
  shopTitleEl.textContent = DIALOG_TITLES.SHOP;
  shopLeaveBtn.textContent = BUTTONS.LEAVE_SHOP;
  versionTagEl.textContent = GAME_VERSION;
  boonSkipBtn.textContent = BUTTONS.SKIP_BOON;
}

/**
 * Hides the "MOVES LEFT" stat block entirely when the moves-limit
 * mechanic is shelved.
 *
 * @returns {void}
 */
function applyMovesLimitVisibility() {
  if (!ENABLE_MOVES_LIMIT) {
    movesStatEl.classList.add('hidden');
  }
}

/**
 * Renders the left-side stats panel.
 *
 * @returns {void}
 */
function renderSideStats() {
  globalMultiplierEl.textContent = `${boonEffectState.globalScoreMultiplier.toFixed(2)}x`;
  globalBonusEl.textContent = signed(boonEffectState.globalScoreBonus);
  globalMultiplierEl.className = `side-stat-value ${statDiffClass(boonEffectState.globalScoreMultiplier, 1.0)}`;
  globalBonusEl.className = `side-stat-value ${statDiffClass(boonEffectState.globalScoreBonus, 0)}`;

  gemStatsListEl.innerHTML = '';

  GEM_DEFINITIONS.forEach(({ id, name, file }) => {
    const baseScore = getGemBaseScore(id);
    const baseMultiplier = getGemBaseMultiplier(id);
    const matchBonus = getMatchBonusForGem(id);

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

  targetMultiplierEl.textContent = `${boonEffectState.targetScoreMultiplier.toFixed(2)}x`;
  targetMultiplierEl.className = `side-stat-value ${statDiffClass(boonEffectState.targetScoreMultiplier, 1.0)}`;

  renderCursePanel();
}

/**
 * Rebuilds the "Active Curses" list at the bottom of the side-stats panel.
 *
 * @returns {void}
 */
function renderCursePanel() {
  curseListEl.innerHTML = '';

  if (curseState.activeCurses.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'curse-empty';
    empty.textContent = 'No active curses.';
    curseListEl.appendChild(empty);
    return;
  }

  curseState.activeCurses.forEach(activeCurse => {
    const def = CURSE_POOL.find(c => c.id === activeCurse.id);
    if (!def) return;

    const row = document.createElement('div');
    row.className = 'curse-entry';
    row.innerHTML = formatNamedEffectSpan(def, true);
    curseListEl.appendChild(row);
  });
}

// ============================================================
// HISTORY: floating tooltip + boon-pick text helpers
// ============================================================

// Boon effect kinds whose appliedEffect.penalizedGems holds RANDOMLY
// chosen gems. Opulence is deliberately absent: it also stores a
// penalizedGems list, but that is "every other gem", not a random pick.
const RANDOM_GEM_TARGET_KINDS = new Set([
  'frenzy',
  'gem_score_brilliance',
  'gem_multiplier_addict',
  'gem_forbidden_swap',
]);

/**
 * Gem id -> display name (e.g. 'ruby' -> 'Ruby'). Falls back to the
 * raw id so a missing catalog entry never breaks the History line.
 *
 * @param {string} gemId
 * @returns {string}
 */
function gemDisplayName(gemId) {
  return ALL_GEM_CATALOG.find(g => g.id === gemId)?.name ?? gemId;
}

/**
 * Joins names into natural English: "A", "A and B", "A, B and C".
 *
 * @param {string[]} names
 * @returns {string}
 */
function joinNamesNatural(names) {
  if (names.length <= 1) return names.join('');
  // Everything except the last name is comma-separated, then " and " + last.
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Builds the "Random gem targeted: ..." part of a boon History line.
 * Returns '' when the boon doesn't roll random gems, so the caller
 * can append it unconditionally.
 *
 * @param {object|null} appliedEffect - the record applyBoonEffect() returned.
 * @returns {string} an HTML fragment (starts with <br>) or ''.
 */
function buildRandomGemTargetLine(appliedEffect) {
  // Only boons that actually roll random gems get this extra line.
  if (!appliedEffect || !RANDOM_GEM_TARGET_KINDS.has(appliedEffect.kind)) return '';

  // The exact gems recorded at pick time (the same list reversal uses).
  const gems = appliedEffect.penalizedGems;
  if (!gems || gems.length === 0) return '';

  const names = gems.map(gemDisplayName);
  return `<br>Random gem targeted: ${joinNamesNatural(names)}`;
}

// --- One shared tooltip element, appended to <body> so no scrolling
// ancestor (the History panel) can clip it. ---
const floatingTooltipEl = document.createElement('div');
floatingTooltipEl.className = 'floating-tooltip hidden';
document.body.appendChild(floatingTooltipEl);

/** Hides the floating tooltip. Safe to call at any time. */
function hideFloatingTooltip() {
  floatingTooltipEl.classList.add('hidden');
}

/**
 * Shows the floating tooltip next to a hovered name span, using the
 * span's own data-tooltip text (built by formatNamedEffectSpan()).
 *
 * @param {HTMLElement} target - the .event-inline-name span.
 * @returns {void}
 */
function showFloatingTooltip(target) {
  // textContent (not innerHTML): the tooltip is plain text.
  floatingTooltipEl.textContent = target.dataset.tooltip || '';

  // Park it at 0,0 BEFORE measuring. A stale position near the right
  // edge would shrink its available width and distort the measurement.
  floatingTooltipEl.style.left = '0px';
  floatingTooltipEl.style.top = '0px';
  floatingTooltipEl.classList.remove('hidden');

  const anchor = target.getBoundingClientRect();
  const tip = floatingTooltipEl.getBoundingClientRect();
  const margin = 8; // minimum gap kept from the viewport edges

  // Horizontal: start at the name's left edge, then clamp so the tooltip
  // never runs off either side (the History panel hugs the right edge).
  let left = anchor.left;
  left = Math.min(left, window.innerWidth - tip.width - margin);
  left = Math.max(left, margin);

  // Vertical: prefer below the name; flip above if it would fall off the bottom.
  let top = anchor.bottom + 6;
  if (top + tip.height > window.innerHeight - margin) {
    top = anchor.top - tip.height - 6;
  }
  top = Math.max(top, margin);

  floatingTooltipEl.style.left = `${left}px`;
  floatingTooltipEl.style.top = `${top}px`;
}

/**
 * Rebuilds the right-side History panel from historyState.entries.
 *
 * @returns {void}
 */
function renderHistoryPanel() {
  // The rebuild below destroys the hovered span, and a destroyed element
  // never fires mouseout, so the tooltip would stay stuck on screen.
  hideFloatingTooltip();

  historyListEl.innerHTML = '';
  historyState.entries.slice().reverse().forEach(entry => {
    const row = document.createElement('div');
    row.className = `history-entry history-entry--${entry.tone}`;
    row.innerHTML = entry.text;
    historyListEl.appendChild(row);
  });
}
/**
 * Rebuilds the 3-slot consumable belt from consumableState.inventory.
 *
 * @returns {void}
 */
function renderConsumableBelt() {
  beltSlotEls.forEach((slotEl, i) => {
    slotEl.innerHTML = '';
    slotEl.classList.remove('belt-slot--filled', 'belt-slot--clickable');
    slotEl.removeAttribute('data-tooltip');
    slotEl.onclick = null;

    const entry = consumableState.inventory[i];
    if (!entry) return;

    const info = CONSUMABLE_INFO[entry.type];
    slotEl.classList.add('belt-slot--filled');
    slotEl.dataset.tooltip = `${info.name} — ${info.description}`;

    const icon = document.createElement('div');
    icon.className = 'belt-slot-icon';
    icon.style.backgroundImage = `url('css/model/svg/consumables/${info.file}')`;
    slotEl.appendChild(icon);

    if (!info.passive) {
      slotEl.classList.add('belt-slot--clickable');
      slotEl.onclick = () => onBeltSlotClick(entry);
    }
  });
}

/**
 * Same dashed-underline/hover-tooltip treatment formatNamedEffectSpan()
 * (event.js) gives boon/curse names, built here for a CONSUMABLE_TYPE
 * instead (used by the Resurrection Cross's deadlock messaging).
 *
 * @param {string} type - a CONSUMABLE_TYPE value.
 * @returns {string} an HTML string — render via innerHTML.
 */
function formatConsumableNameSpan(type) {
  const info = CONSUMABLE_INFO[type];
  const description = String(info.description)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<span class="event-inline-name event-inline-name--consumable" data-tooltip="${description}">${info.name}</span>`;
}

/**
 * NEW — applies VIP Membership Card's 10% shop-price discount, if
 * held. Wrapped around every price shown/charged anywhere in the shop
 * dialog (boon cards, consumable squares, both Customer Service
 * prices) — a single call site keeps the discount consistent instead
 * of re-checking isBoonActive() at each individual price line.
 *
 * @param {number} price
 * @returns {number}
 */
function applyVipDiscount(price) {
  return isBoonActive('vip_membership_card') ? Math.round(price * 0.9) : price;
}

/**
 * Handles a click on a filled, non-passive belt slot.
 *
 * @param {object} entry
 * @returns {void}
 */
function onBeltSlotClick(entry) {
  if (busy) return;
  if (placementMode || pendingConsumableEntry) return;

  const info = CONSUMABLE_INFO[entry.type];
  if (info.passive) return;

  if (info.requiresTarget) {
    pendingConsumableEntry = entry;
    gloveSource = null; // make sure a Glove always starts at step 1

    // The Glove needs two clicks, so its prompt reads differently.
    messageEl.textContent = entry.type === CONSUMABLE_TYPE.MAGICAL_GLOVE
      ? 'select the gem you want to move'
      : `select a gem to use your ${info.name} on`;
    return;
  }

  if (entry.type === CONSUMABLE_TYPE.GOLDEN_TICKET) {
    activateGoldenTicketConsumable(entry);
  }
  // NOTE — Dice used to have its own no-target branch here
  // (activateDiceConsumable()). Dice is now `requiresTarget: true`
  // (see resources/consumable/consumable.js), so it's caught by the
  // `if (info.requiresTarget)` branch above instead, same as
  // Pickaxe/Dynamite — this function never reaches Dice anymore.
}

/**
 * Handles the board click that lands while a target-requiring
 * consumable (Pickaxe/Dynamite/Dice) is armed.
 *
 * CHANGED THIS ROUND — Pickaxe/Dynamite clears now count toward the
 * same event tracking a normal swap does: Elite gem-tracking,
 * Silent Vein's detonation check, and Decaying Birthstone's lethal
 * clear-count. Dice needed no change — it already runs through
 * resolveMatches(), which does all of this itself.
 *
 * @param {number} row
 * @param {number} col
 * @returns {void}
 */
function handleConsumableTargetClick(row, col) {
  if (grid[row][col] === BLOCKED) return;
  // Obsidian can't be targeted (nothing meaningful to destroy there).
  if (grid[row][col] === OBSIDIAN) return;

  // NEW — the Glove has its own two-click flow, so hand it off before the
  // shared code below (which assumes ONE click consumes the item).
  if (pendingConsumableEntry.type === CONSUMABLE_TYPE.MAGICAL_GLOVE) {
    handleGloveClick(row, col);
    return;
  }

  const entry = pendingConsumableEntry;
  pendingConsumableEntry = null;

  busy = true;
  messageEl.textContent = '';

  // Dice: no clearing/scoring, just a scoped 3x3 shuffle; the normal
  // cascade pipeline then catches (and tracks) any matches it creates.
  if (entry.type === CONSUMABLE_TYPE.DICE) {
    triggerDiceShuffleArea(grid, row, col);

    removeConsumableFromInventory(entry.pickId);
    renderConsumableBelt();
    renderBoardWithInteractions();

    addHistoryEntry('event', 'Dice shuffles a 3\u00d73 area of the board.', 'event');
    renderHistoryPanel();

    comboCount = 0;
    resolveMatches();
    return;
  }

  let clearedCells = [];
  let comboLabel = '';
  if (entry.type === CONSUMABLE_TYPE.PICKAXE) {
    clearedCells = triggerPickaxe(grid, row, col);
    comboLabel = 'Pickaxe';
  } else if (entry.type === CONSUMABLE_TYPE.DYNAMITE) {
    clearedCells = triggerDynamite(grid, row, col);
    comboLabel = 'Dynamite';
  }

  removeConsumableFromInventory(entry.pickId);
  renderConsumableBelt();

  if (clearedCells.length === 0) {
    busy = false;
    checkEndState();
    return;
  }

  // Every consumable-cleared cell scores as a flat "incidental" cell
  // (no formed match), same as the swap-activated combos do.
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));

  // NEW — Silent Vein: a "detonation" means a special gem fired. If any
  // cleared cell holds one (targeted directly OR reached by a chain
  // reaction), count it. Checked NOW, while specialGemState still
  // holds those cells — continueCascadeAfterMatch() clears them later.
  const specialGemFired = clearedCells.some(([r, c]) => !!specialGemState.grid[r][c]);
  if (specialGemFired) markChallengeDetonation();

  // NEW — Elite gem_cap / gem_subscore_race tracking. Must run BEFORE
  // applyScoreGain(), since that may resolve the Elite on a level-clear.
  // matchedGroups is empty (nothing was "matched"); comboCount is 1.
  recordEliteGemActivity([], incidentalCells, 1);

  // NEW — Decaying Birthstone lethal check (same order as the swap
  // combos in finishSwapActivatedCombo()). If it kills the run, stop.
  if (checkDecayingBirthstoneLethal([], incidentalCells)) return;

  updateObjectiveBanner(); // reflect any new Elite count / detonation
  comboCount = 0;

  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });
  const leveledUp = applyScoreGain(gained, `${comboLabel}: ${signed(gained)}`);
  if (leveledUp) pendingLevelUp = true;

  markMatchedGems(boardEl, toBooleanGrid(clearedCells));
  continueCascadeAfterMatch(clearedCells);
}

/**
 * NEW — Magical Glove's two-click flow.
 *   Click 1: pick the gem to move (highlighted as "selected").
 *   Click 2: pick ANY other usable cell; the two exchange places.
 * Clicking the first gem again cancels the pick (the Glove stays armed).
 * After the swap, the normal match pipeline runs, exactly like Dice.
 *
 * @param {number} row
 * @param {number} col
 * @returns {void}
 */
function handleGloveClick(row, col) {
  const entry = pendingConsumableEntry;

  // --- Step 1: remember the first gem and highlight it ---
  if (!gloveSource) {
    gloveSource = [row, col];
    updateSelectedVisual(boardEl, gloveSource);
    messageEl.textContent = 'select any other gem to swap it with';
    return;
  }

  const [sr, sc] = gloveSource;

  // --- Clicking the same gem again = undo the first pick ---
  if (sr === row && sc === col) {
    gloveSource = null;
    updateSelectedVisual(boardEl, null);
    messageEl.textContent = 'select the gem you want to move';
    return;
  }

  // --- Step 2: perform the swap (grid colors + special overlays) ---
  const swapped = triggerMagicalGloveSwap(grid, sr, sc, row, col);
  if (!swapped) {
    // Shouldn't happen (both clicks were already validated above),
    // but if it does, reset cleanly instead of leaving the Glove stuck.
    gloveSource = null;
    updateSelectedVisual(boardEl, null);
    messageEl.textContent = 'select the gem you want to move';
    return;
  }

  // The Glove is used up as soon as the swap succeeds, whether or not
  // it creates a match.
  pendingConsumableEntry = null;
  gloveSource = null;
  busy = true; // block input while the cascade resolves
  messageEl.textContent = '';

  removeConsumableFromInventory(entry.pickId);
  renderConsumableBelt();
  renderBoardWithInteractions();

  addHistoryEntry('event', 'Magical Glove swaps two gems.', 'event');
  renderHistoryPanel();

  // Run the normal pipeline. Passing the two swapped cells lets a
  // spawned special gem prefer one of them, same as a real player swap.
  // comboCount starts at 0; resolveMatches() bumps it to 1 on a match.
  // pendingGoldenTicketTurn is deliberately NOT set, so the Glove never
  // uses up a Golden Ticket turn. If nothing matches, resolveMatches()
  // just settles, frees `busy`, and runs checkEndState().
  comboCount = 0;
  resolveMatches([[sr, sc], [row, col]]);
}

/**
 * Golden Ticket: (re)starts the 2x-score window.
 *
 * @param {object} entry
 * @returns {void}
 */
function activateGoldenTicketConsumable(entry) {
  goldenTicketTurnsRemaining = GOLDEN_TICKET_TURNS;
  removeConsumableFromInventory(entry.pickId);
  renderConsumableBelt();
  updateGoldenTicketStatus();

  addHistoryEntry('event', `Golden Ticket activated — score doubled for the next ${GOLDEN_TICKET_TURNS} turns!`, 'positive');
  renderHistoryPanel();
}

/**
 * Decrements the Golden Ticket counter by one, IF one is active.
 *
 * @returns {void}
 */
function consumeGoldenTicketTurnIfActive() {
  if (goldenTicketTurnsRemaining > 0) {
    goldenTicketTurnsRemaining--;
    updateGoldenTicketStatus();
  }
}

/** Shows/hides and updates the Golden Ticket status banner text. */
function updateGoldenTicketStatus() {
  if (goldenTicketTurnsRemaining > 0) {
    const plural = goldenTicketTurnsRemaining === 1 ? '' : 's';
    goldenTicketStatusEl.textContent = `\u2728 Golden Ticket — ${goldenTicketTurnsRemaining} turn${plural} left (2x score)`;
    goldenTicketStatusEl.classList.remove('hidden');
  } else {
    goldenTicketStatusEl.classList.add('hidden');
  }
}

/**
 * Buys one consumable from the shop's consumable offer.
 *
 * @param {string} type
 * @param {number} price
 * @returns {void}
 */
function buyConsumableFromShop(type, price) {
  if (score < price) return;
  if (!hasBeltSpace()) return;

  score -= price;
  scoreEl.textContent = score;

  addConsumableToInventory(type);
  markConsumablePurchased(type);
  renderConsumableBelt();

  const info = CONSUMABLE_INFO[type];
  addHistoryEntry('boon', `Bought from shop: ${info.name} (-${price}) — ${info.description}`, 'boon');
  renderHistoryPanel();

  renderShopDialog();
}

/**
 * Converts a list of [row, col] pairs into the boolean SIZE x SIZE
 * grid markMatchedGems() (render.js) expects.
 *
 * @param {[number, number][]} cells
 * @returns {boolean[][]}
 */
function toBooleanGrid(cells) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  cells.forEach(([r, c]) => { g[r][c] = true; });
  return g;
}

/** Formats a score delta with an explicit sign. */
function signed(amount) {
  return amount >= 0 ? `+${amount}` : `${amount}`;
}

/**
 * The isExcluded predicate for board.js's findMatches()/
 * hasPossibleMove()/findHintMove(): true for any cell currently
 * holding a Hyperstar.
 *
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isHyperstarCell(row, col) {
  return specialGemState.grid[row][col] === SPECIAL_GEM_TYPE.HYPERSTAR;
}

/**
 * The isSpecialSwap predicate for board.js's hasPossibleMove()/
 * findHintMove().
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
  return !!a && !!b;
}

/**
 * Builds the History/popup text for one cascade STEP resolved via the
 * normal match-detection path.
 *
 * @param {{gemType: number, length: number}[]} matchedGroups
 * @param {{gemType: number, row: number, col: number}[]} incidentalCells
 * @param {number} comboCount
 * @param {number} gained
 * @returns {string}
 */
function buildMatchMessage(matchedGroups, incidentalCells, comboCount, gained) {
  const matchParts = matchedGroups.map(({ gemType, length }) => {
    const gemName = GEM_DEFINITIONS[gemType]?.name ?? 'Gem';
    return `Match ${length} ${gemName}`;
  });

  if (incidentalCells.length > 0) {
    matchParts.push(`Chain Reaction (${incidentalCells.length} gems)`);
  }

  const body = matchParts.length > 0 ? matchParts.join(' + ') : 'Match';

  const prefix = comboCount > 1 ? `Combo x${comboCount}: ` : '';
  return `${prefix}${body}: ${signed(gained)}`;
}

/**
 * Picks the CSS class that colors a side-stat value relative to its
 * OWN no-boon default.
 *
 * @param {number} value
 * @param {number} defaultValue
 * @returns {string}
 */
function statDiffClass(value, defaultValue) {
  if (value > defaultValue) return 'gem-stat-boosted';
  if (value < defaultValue) return 'gem-stat-penalized';
  return '';
}

/**
 * Thin wrapper around render.js's renderBoard().
 *
 * @param {object} [extraOptions]
 * @returns {void}
 */
function renderBoardWithInteractions(extraOptions = {}) {
  renderBoard(boardEl, grid, onCellClick, { onCellSwap: onCellDragSwap, ...extraOptions });
}

/**
 * (Re)starts the hint countdown.
 *
 * @returns {void}
 */
function scheduleHintTimer() {
  if (hintTimeoutId) clearTimeout(hintTimeoutId);
  hintTimeoutId = setTimeout(showHintNow, HINT_DELAY_MS);
}

/**
 * Fires once HINT_DELAY_MS of idle time has passed since the last
 * real match.
 *
 * @returns {void}
 */
function showHintNow() {
  if (busy) return;
  const move = findHintMove(grid, isHyperstarCell, isSpecialSwapPair);
  if (!move) return;
  showHintHighlight(boardEl, [move.from, move.to]);
}

/**
 * Resets all game state to a fresh start and renders the initial board.
 *
 * @returns {void}
 */
function init() {
  resetBoonEffects();
  resetProgression(1);
  resetBoons();
  resetTiles();
  resetSpecialGems();
  resetHistory();
  resetShop();
  resetBoonShop();
  resetEvents();
  resetCurses();
  resetConsumables();
  resetConsumableShop();
  resetCustomerService(); // NEW

  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(BLOCKED));
  rebuildGridRespectingBlocked(grid);
  score = DEFAULT_SCORE;
  moves = progressionState.movesAllowed;
  selected = null;
  placementMode = null;
  placementShape = null;
  tilePlacementQueue = [];
  tilePlacementFinalContinuation = null;
  busy = false;
  comboCount = 0;
  pendingContinuation = null;
  pendingLevelUp = false;
  pendingEventResult = null;
  pendingConsumableEntry = null;
  gloveSource = null; // never carry a half-finished Glove swap into a fresh run
  pendingGoldenTicketTurn = false;
  goldenTicketTurnsRemaining = 0;
  pendingClearedLevels = []; // NEW — never carry a queued reward into a fresh run
  pendingLevelUpClearedLevel = 1;
  shopOpenedForLevel = null; // NEW — never carry this guard into a fresh run
  curseRemovalPickerOpen = false; // NEW

  scoreEl.textContent = score;
  movesEl.textContent = moves;
  targetEl.textContent = progressionState.scoreTarget;
  levelEl.textContent = progressionState.level;
  messageEl.textContent = MESSAGES.SELECT_PROMPT;

  loseDialogEl.classList.add('hidden');
  levelUpDialogEl.classList.add('hidden');
  boonDialogEl.classList.add('hidden');
  shopDialogEl.classList.add('hidden');
  eventDialogEl.classList.add('hidden');
  deadlockDialogEl.classList.add('hidden'); // NEW — safety net, same as every other dialog reset
  shopContinuation = null;

  renderSideStats();
  renderBoardWithInteractions();
  renderHistoryPanel();
  scheduleHintTimer();
  updateObjectiveBanner();
  startObjectiveTicker();
  renderConsumableBelt();
  updateGoldenTicketStatus();
}

/**
 * Floats score-change text above the board for SCORE_POPUP_MS.
 *
 * @param {string} text
 * @returns {void}
 */
function showScorePopup(text) {
  scorePopupEl.textContent = text;
  scorePopupEl.classList.add('visible');

  if (scorePopupHideTimeout) clearTimeout(scorePopupHideTimeout);
  scorePopupHideTimeout = setTimeout(() => {
    scorePopupEl.classList.remove('visible');
    scorePopupHideTimeout = null;
  }, SCORE_POPUP_MS);
}

/** mm:ss display for a live countdown. */
function formatCountdown(msRemaining) {
  const clamped = Math.max(0, msRemaining);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Rebuilds the objective banner's text/visibility from activeEventState.
 *
 * CHANGED THIS ROUND — the Challenge branch now has TWO shapes:
 *   - A time-limited challenge (`def.timeLimitMs`, e.g. A Test of
 *     Endurance) shows a live mm:ss countdown (same convention as
 *     Elite's time_race banner) plus a note about its decay rate.
 *   - Anything else (Silent Vein) keeps the original
 *     "clear N more levels without triggering any special gem" text.
 *
 * @returns {void}
 */
function updateObjectiveBanner() {
  if (activeEventState.type === EVENT_TYPE.ELITE) {
    const info = getEliteProgressInfo();
    if (!info) { objectiveBannerEl.classList.add('hidden'); return; }

    if (info.kind === 'time_race') {
      const elapsed = Date.now() - activeEventState.eliteStartedAt;
      const remaining = activeEventState.eliteDurationMs - elapsed;
      objectiveTextEl.textContent = `⚔ ${info.name} — reach ${progressionState.scoreTarget} before ${formatCountdown(remaining)}`;
    } else if (info.kind === 'gem_cap') {
      objectiveTextEl.textContent = info.breached
        ? `⚔ ${info.name} — cap exceeded (${info.count}/${info.cap} ${info.gemName})! Clear the level to receive the penalty.`
        : `⚔ ${info.name} — clear without matching/destroying more than ${info.cap} ${info.gemName} (${info.count}/${info.cap})`;
    } else if (info.kind === 'gem_subscore_race') {
      const shown = Math.min(info.subscore, info.threshold);
      objectiveTextEl.textContent = `⚔ ${info.name} — earn ${info.threshold} score from ${info.gemName} before clearing (${shown}/${info.threshold})`;
    }
    objectiveBannerEl.classList.remove('hidden');
  } else if (activeEventState.type === EVENT_TYPE.CHALLENGE) {
    const def = getActiveChallengeDef();
    if (!def) { objectiveBannerEl.classList.add('hidden'); return; }

    if (def.timeLimitMs) {
      // NEW — a time-limited, decaying challenge (A Test of Endurance).
      const elapsed = Date.now() - activeEventState.challengeStartedAt;
      const timeRemaining = activeEventState.challengeTimeLimitMs - elapsed;
      const decayNote = def.decayEffect
        ? ` (-${Math.round(def.decayEffect.percent * 100)}% score every ${Math.round(def.decayEffect.intervalMs / 1000)}s)`
        : '';
      objectiveTextEl.textContent = `🔨 ${def.name} — reach ${progressionState.scoreTarget} before ${formatCountdown(timeRemaining)}${decayNote}`;
    } else {
      const remaining = activeEventState.challengeLevelsRemaining;
      objectiveTextEl.textContent = activeEventState.challengeDetonated
        ? `🔨 ${def.name} — challenge failed (a special gem detonated). Clear this level to move on.`
        : `🔨 ${def.name} — clear ${remaining} more level${remaining === 1 ? '' : 's'} without triggering any special gem`;
    }
    objectiveBannerEl.classList.remove('hidden');
  } else {
    objectiveBannerEl.classList.add('hidden');
  }
}

/** (Re)starts the 1-second objective-banner tick. */
function startObjectiveTicker() {
  if (objectiveIntervalId) clearInterval(objectiveIntervalId);
  objectiveIntervalId = setInterval(updateObjectiveBanner, 1000);
}

/**
 * Swaps the event dialog's body over to a single result line + a
 * "Continue" button.
 *
 * @param {string} text
 * @param {() => void} onContinue
 * @returns {void}
 */
function showEventResult(text, onContinue) {
  eventChoicesEl.className = 'event-choices';
  eventStoryEl.innerHTML = text;
  eventChoicesEl.innerHTML = '';
  const continueBtn = document.createElement('button');
  continueBtn.textContent = 'Continue';
  continueBtn.addEventListener('click', () => {
    eventDialogEl.classList.add('hidden');
    onContinue();
  });
  eventChoicesEl.appendChild(continueBtn);
}

/**
 * Shows an Elite/Challenge's outcome as a proper dialog.
 *
 * @param {{title: string, text: string}} result
 * @param {() => void} onContinue
 * @returns {void}
 */
function showEliteChallengeResultDialog(result, onContinue) {
  eventTitleEl.textContent = result.title;
  eventDialogEl.classList.remove('hidden');
  showEventResult(result.text, onContinue);
}

/** Dispatches to the right Encounter dialog builder based on the offer's `kind`. */
function showEncounterDialog(offer, onContinue) {
  if (offer.kind === 'trade') {
    showGemMoleDialog(offer, onContinue);
  } else if (offer.kind === 'gamble') {
    showFortunesFollyDialog(offer.def, onContinue);
  } else if (offer.kind === 'help_or_absorb') {
    showLostMinerDialog(offer.def, onContinue);
  } else if (offer.kind === 'steal') {
    showMeditatingElfDialog(offer.def, onContinue);
  } else if (offer.kind === 'chest') {
    showChestDialog(offer.def, onContinue);
  } else {
    onContinue();
  }
}

/** Gem Mole's trade-or-decline flow. */
function showGemMoleDialog(offer, onContinue) {
  const { def, tradeAwayBoon, tradeAwayDef, replacementDef } = offer;

  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.ENCOUNTER, def.name);
  eventStoryEl.textContent = def.storyText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = `1. ${def.acceptLabel}`;
  acceptBtn.addEventListener('click', () => {
    const { givenName, receivedName } = resolveEncounterAccept(tradeAwayBoon, replacementDef);
    renderSideStats();
    const resultText = def.resultAcceptText(givenName, receivedName);
    addHistoryEntry('event', `Encounter — ${def.name}: ${resultText}`, 'event');
    renderHistoryPanel();
    showEventResult(resultText, onContinue);
  });

  const declineBtn = document.createElement('button');
  declineBtn.textContent = `2. ${def.declineLabel}`;
  declineBtn.addEventListener('click', () => {
    resolveEncounterDecline();
    addHistoryEntry('event', `Encounter — ${def.name}: ${def.resultDeclineText}`, 'event');
    renderHistoryPanel();
    showEventResult(def.resultDeclineText, onContinue);
  });

  eventChoicesEl.appendChild(acceptBtn);
  eventChoicesEl.appendChild(declineBtn);
  eventDialogEl.classList.remove('hidden');
}

/** Fortune's Folly's INITIAL node. */
function showFortunesFollyDialog(def, onContinue) {
  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.ENCOUNTER, def.name);
  eventStoryEl.textContent = def.storyText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  def.betOptions.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.textContent = `${index + 1}. ${opt.label}`;
    btn.addEventListener('click', () => handleFollyInitialBet(def, opt.percent, onContinue));
    eventChoicesEl.appendChild(btn);
  });

  const payBtn = document.createElement('button');
  payBtn.textContent = `${def.betOptions.length + 1}. ${def.payAndLeave.label}`;
  payBtn.addEventListener('click', () => handleFollyPayAndLeave(def, onContinue));
  eventChoicesEl.appendChild(payBtn);

  eventDialogEl.classList.remove('hidden');
}

/** Resolves the very first bet. */
function handleFollyInitialBet(def, percent, onContinue) {
  const { potAmount, won, scoreDelta } = placeFortunesFollyBet(percent, score);

  score += scoreDelta;
  scoreEl.textContent = score;

  if (won) {
    const doubledPot = potAmount * 2;
    addHistoryEntry('event', `Fortune's Folly: you wager ${potAmount} and win — winnings now ${doubledPot}.`, 'positive');
    renderHistoryPanel();
    showFollyPostWin(def, doubledPot, def.initialWinText(doubledPot), onContinue);
  } else {
    addHistoryEntry('event', `Fortune's Folly: you wager ${potAmount} and lose it.`, 'negative');
    renderHistoryPanel();
    showEventResult(def.initialLoseText, onContinue);
  }
}

/** "Pay 5% and leave". */
function handleFollyPayAndLeave(def, onContinue) {
  const { amount, scoreDelta } = payFortunesFollyAndLeave(score, def.payAndLeave.percent);
  score += scoreDelta;
  scoreEl.textContent = score;
  addHistoryEntry('event', `Fortune's Folly: you pay ${amount} and walk away.`, 'event');
  renderHistoryPanel();
  showEventResult(def.payAndLeave.resultText, onContinue);
}

/** The "post-win" node for Fortune's Folly. */
function showFollyPostWin(def, pot, introText, onContinue) {
  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.ENCOUNTER, def.name);
  eventStoryEl.textContent = introText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  const doubleBtn = document.createElement('button');
  doubleBtn.textContent = `1. ${def.doubleLabel}`;
  doubleBtn.addEventListener('click', () => handleFollyDoubleOrNothing(def, pot, onContinue));

  const cashOutBtn = document.createElement('button');
  cashOutBtn.textContent = `2. ${def.cashOutLabel}`;
  cashOutBtn.addEventListener('click', () => handleFollyCashOut(def, pot, onContinue));

  eventChoicesEl.appendChild(doubleBtn);
  eventChoicesEl.appendChild(cashOutBtn);
  eventDialogEl.classList.remove('hidden');
}

/** One Double-or-Nothing flip. */
function handleFollyDoubleOrNothing(def, pot, onContinue) {
  const { won, newPot } = flipFortunesFollyDoubleOrNothing(pot);

  if (won) {
    addHistoryEntry('event', `Fortune's Folly: double or nothing — winnings now ${newPot}.`, 'positive');
    renderHistoryPanel();
    showFollyPostWin(def, newPot, def.doubleOrNothingWinText(newPot), onContinue);
  } else {
    addHistoryEntry('event', "Fortune's Folly: double or nothing — fortune turns against you. Winnings lost.", 'negative');
    renderHistoryPanel();
    showEventResult(def.doubleOrNothingLoseText, onContinue);
  }
}

/** Cashes out. */
function handleFollyCashOut(def, pot, onContinue) {
  score += pot;
  scoreEl.textContent = score;
  addHistoryEntry('event', `Fortune's Folly: you cash out ${pot} and leave the table.`, 'positive');
  renderHistoryPanel();
  showEventResult(def.callItADayText(pot), onContinue);
}

/** Lost Miner's three-way choice. */
function showLostMinerDialog(def, onContinue) {
  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.ENCOUNTER, def.name);
  eventStoryEl.textContent = def.storyText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  const helpBtn = document.createElement('button');
  helpBtn.textContent = `1. ${def.helpLabel}`;
  helpBtn.addEventListener('click', () => {
    const { scoreDelta } = resolveLostMinerHelp(score, def);
    score += scoreDelta;
    scoreEl.textContent = score;
    addHistoryEntry('event', `Lost Miner: you free the miner and receive ${scoreDelta} score.`, 'positive');
    renderHistoryPanel();
    showEventResult(def.helpResultText(scoreDelta), onContinue);
  });

  const absorbBtn = document.createElement('button');
  absorbBtn.textContent = `2. ${def.absorbLabel}`;
  absorbBtn.addEventListener('click', () => {
    const { grantedBoonDef, curseDef } = resolveLostMinerAbsorb();
    renderSideStats();
    const boonPart = grantedBoonDef ? formatNamedEffectSpan(grantedBoonDef) : 'nothing of value';
    const cursePart = formatNamedEffectSpan(curseDef, true);
    const text = def.absorbResultText(boonPart, cursePart);
    addHistoryEntry('event', `Lost Miner: ${text}`, 'negative');
    renderHistoryPanel();
    showEventResult(text, onContinue);
  });

  const leaveBtn = document.createElement('button');
  leaveBtn.textContent = `3. ${def.leaveLabel}`;
  leaveBtn.addEventListener('click', () => {
    addHistoryEntry('event', `Lost Miner: ${def.leaveResultText}`, 'event');
    renderHistoryPanel();
    showEventResult(def.leaveResultText, onContinue);
  });

  eventChoicesEl.appendChild(helpBtn);
  eventChoicesEl.appendChild(absorbBtn);
  eventChoicesEl.appendChild(leaveBtn);
  eventDialogEl.classList.remove('hidden');
}

/** Meditating Elf's steal-or-leave choice. */
function showMeditatingElfDialog(def, onContinue) {
  // Standard event header + numbered single-column choice list.
  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.ENCOUNTER, def.name);
  eventStoryEl.textContent = def.storyText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  const stealBtn = document.createElement('button');
  stealBtn.textContent = `1. ${def.stealLabel}`;
  stealBtn.addEventListener('click', () => {
    // Roll + grant everything (boons and/or curses).
    const { stolenSpans, gotCurse } = resolveMeditatingElfSteal(def);

    // Boons/curses can change stats and (Weight of Greed) the target.
    renderSideStats();
    targetEl.textContent = progressionState.scoreTarget;

    const text = def.stealResultText(stolenSpans);
    // Red if any curse came along, otherwise the plain event color.
    addHistoryEntry('event', `Meditating Elf: ${text}`, gotCurse ? 'negative' : 'event');
    renderHistoryPanel();
    showEventResult(text, onContinue);
  });

  const leaveBtn = document.createElement('button');
  leaveBtn.textContent = `2. ${def.leaveLabel}`;
  leaveBtn.addEventListener('click', () => {
    // Pure no-op choice: just log and show the flavor text.
    addHistoryEntry('event', `Meditating Elf: ${def.leaveResultText}`, 'event');
    renderHistoryPanel();
    showEventResult(def.leaveResultText, onContinue);
  });

  eventChoicesEl.appendChild(stealBtn);
  eventChoicesEl.appendChild(leaveBtn);
  eventDialogEl.classList.remove('hidden');
}

/** To Open or To Not Open's chest choice (25% treasure / 75% Mimic). */
function showChestDialog(def, onContinue) {
  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.ENCOUNTER, def.name);
  eventStoryEl.textContent = def.storyText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  const openBtn = document.createElement('button');
  openBtn.textContent = `1. ${def.openLabel}`;
  openBtn.addEventListener('click', () => {
    // The 25/75 roll happens here, at the moment the player opens it.
    const result = resolveChestOpen(score, def);

    // Apply the score change (main.js owns `score`).
    score += result.scoreDelta;
    scoreEl.textContent = score;

    // Refresh panels + target (a curse may raise the target score).
    renderSideStats();
    targetEl.textContent = progressionState.scoreTarget;

    // Build the outcome-specific text.
    let text;
    if (result.outcome === 'treasure') {
      text = def.openTreasureText(result.boonSpans, result.scoreDelta);
    } else {
      // Show the amount lost as a positive number in the text.
      text = def.openMimicText(result.boonSpans[0], result.curseSpan, Math.abs(result.scoreDelta));
    }

    // Treasure = good (boon violet is reserved for picks, so use
    // 'positive'); Mimic = bad.
    addHistoryEntry('event', `To Open or To Not Open: ${text}`, result.outcome === 'treasure' ? 'positive' : 'negative');
    renderHistoryPanel();
    showEventResult(text, onContinue);
  });

  const leaveBtn = document.createElement('button');
  leaveBtn.textContent = `2. ${def.leaveLabel}`;
  leaveBtn.addEventListener('click', () => {
    addHistoryEntry('event', `To Open or To Not Open: ${def.leaveResultText}`, 'event');
    renderHistoryPanel();
    showEventResult(def.leaveResultText, onContinue);
  });

  eventChoicesEl.appendChild(openBtn);
  eventChoicesEl.appendChild(leaveBtn);
  eventDialogEl.classList.remove('hidden');
}

/**
 * Builds and shows the Elite dialog (fight-or-flee). Warmonger: once
 * held, the Decline button is struck-through and inert.
 */
function showEliteDialog(def, onContinue) {
  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.ELITE, def.name);
  eventStoryEl.textContent = def.storyText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  const fightBtn = document.createElement('button');
  fightBtn.textContent = `1. ${def.fightLabel}`;
  fightBtn.addEventListener('click', () => {
    startEliteFight(def, score);
    targetEl.textContent = progressionState.scoreTarget;
    addHistoryEntry('event', `Elite — ${def.name}: you accept the challenge!`, 'event');
    renderHistoryPanel();
    updateObjectiveBanner();
    eventDialogEl.classList.add('hidden');
    onContinue();
  });

  const declineBtn = document.createElement('button');
  declineBtn.textContent = `2. ${def.declineLabel}`;

  // Warmonger check.
  const warmongerHeld = isBoonActive('warmonger');
  if (warmongerHeld) {
    declineBtn.classList.add('event-choice-locked');
    // No click listener at all — the button is visually present but
    // completely inert, per design ("still shown but not clickable").
  } else {
    declineBtn.addEventListener('click', () => {
      const result = declineElite(def, score);
      if (result.scoreDelta) {
        score += result.scoreDelta;
        scoreEl.textContent = score;
      }
      renderSideStats();
      const tone = result.scoreDelta < 0 ? 'negative' : 'event';
      addHistoryEntry('event', `Elite — ${def.name}: ${result.resultText}`, tone);
      renderHistoryPanel();
      showEventResult(result.resultText, onContinue);
    });
  }

  eventChoicesEl.appendChild(fightBtn);
  eventChoicesEl.appendChild(declineBtn);

  if (warmongerHeld) {
    const note = document.createElement('div');
    note.className = 'event-choice-lock-note';
    note.textContent = '(Due to Warmonger, you cannot select this option.)';
    eventChoicesEl.appendChild(note);
  }

  eventDialogEl.classList.remove('hidden');
}

/**
 * The single entry point for "an event MIGHT happen right now."
 *
 * @param {() => void} onContinue
 * @returns {void}
 */
function attemptEvent(onContinue) {
  const type = tryTriggerEvent(score);
  if (!type) { onContinue(); return; }

  if (type === EVENT_TYPE.ENCOUNTER) {
    const offer = buildEncounterOffer(score);
    if (!offer) { onContinue(); return; }
    showEncounterDialog(offer, onContinue);
  } else if (type === EVENT_TYPE.ELITE) {
    const def = pickEliteDef();
    if (!def) { onContinue(); return; }
    showEliteDialog(def, onContinue);
  } else if (type === EVENT_TYPE.CHALLENGE) {
    const def = pickChallengeDef();
    if (!def) { onContinue(); return; }
    showChallengeDialog(def, onContinue);
  } else {
    onContinue();
  }
}

/**
 * Builds and shows the Challenge dialog (accept-or-decline).
 *
 * CHANGED THIS ROUND:
 *   - Adventure Junkie: same struck-through/inert Decline treatment
 *     Warmonger gets on the Elite dialog.
 *   - Accept now shows `def.acceptResultText` (if the def declares
 *     one) as a brief flavor beat via showEventResult() before
 *     actually continuing — Silent Vein has none, so it's skipped
 *     for that entry (falls straight through like before).
 *   - Decline now ALSO shows `def.declineText` (if present) via
 *     showEventResult(), instead of just hiding the dialog silently —
 *     Silent Vein still has no declineText, so its decline stays a
 *     silent close (a small, deliberate behavior change; flagged in
 *     the handoff).
 */
function showChallengeDialog(def, onContinue) {
  eventTitleEl.textContent = formatEventTitle(EVENT_TYPE.CHALLENGE, def.name);
  eventStoryEl.textContent = def.storyText;
  eventChoicesEl.className = 'event-choices event-choices--list';
  eventChoicesEl.innerHTML = '';

  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = `1. ${def.acceptLabel}`;
  acceptBtn.addEventListener('click', () => {
    startChallenge(def);
    addHistoryEntry('event', `Challenge — ${def.name}: you accept the challenge!`, 'event');
    renderHistoryPanel();
    updateObjectiveBanner();
    if (def.acceptResultText) {
      showEventResult(def.acceptResultText, onContinue);
    } else {
      eventDialogEl.classList.add('hidden');
      onContinue();
    }
  });

  const declineBtn = document.createElement('button');
  declineBtn.textContent = `2. ${def.declineLabel}`;

  const adventureJunkieHeld = isBoonActive('adventure_junkie');
  if (adventureJunkieHeld) {
    declineBtn.classList.add('event-choice-locked');
  } else {
    declineBtn.addEventListener('click', () => {
      declineChallenge();
      const resultText = def.declineText;
      addHistoryEntry('event', `Challenge — ${def.name}: ${resultText || 'declined.'}`, 'event');
      renderHistoryPanel();
      if (resultText) {
        showEventResult(resultText, onContinue);
      } else {
        eventDialogEl.classList.add('hidden');
        onContinue();
      }
    });
  }

  eventChoicesEl.appendChild(acceptBtn);
  eventChoicesEl.appendChild(declineBtn);

  if (adventureJunkieHeld) {
    const note = document.createElement('div');
    note.className = 'event-choice-lock-note';
    note.textContent = '(Due to Adventure Junkie, you cannot select this option.)';
    eventChoicesEl.appendChild(note);
  }

  eventDialogEl.classList.remove('hidden');
}

/**
 * NEW — Frantic Star's unprompted self-activation check. Call this
 * exactly once, right when a cascade has genuinely settled.
 *
 * @returns {boolean} true if it fired.
 */
function maybeTriggerFranticStarSelfActivation() {
  if (!isBoonActive('frantic_star')) return false;
  if (Math.random() >= 0.05) return false;

  const result = triggerHyperstarSelfActivation(grid);
  if (!result) return false;

  // Fire specials caught in the wipe; skip the self-activating Hyperstar itself.
  const { hyperRow, hyperCol, clearedCells: baseCleared } = result;
  const clearedCells = expandChainReaction(grid, baseCleared, new Set([`${hyperRow},${hyperCol}`]));
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));
  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });

  addHistoryEntry('event', 'A Hyperstar flares up on its own!', 'event');
  renderHistoryPanel();

  finishSwapActivatedCombo(clearedCells, gained, `Frantic Star: ${signed(gained)}`, [], incidentalCells);
  return true;
}

/**
 * NEW — A Test of Endurance's recurring score decay, checked once
 * every time a cascade fully settles.
 *
 * @returns {void}
 */
function applyChallengeDecayIfActive() {
  const deducted = applyChallengeDecayIfDue(score);
  if (deducted > 0) {
    score -= deducted;
    scoreEl.textContent = score;
    addHistoryEntry('event', `A Test of Endurance saps ${deducted} score.`, 'negative');
    renderHistoryPanel();
  }
}

/**
 * NEW — checks every currently-active Decaying Birthstone curse
 * against this cascade step's clears, and immediately ends the run if
 * any of them just crossed their threshold.
 *
 * @param {{gemType:number,length:number}[]} matchedGroups
 * @param {{gemType:number,row:number,col:number}[]} incidentalCells
 * @returns {boolean} true if the run just ended.
 */
function checkDecayingBirthstoneLethal(matchedGroups, incidentalCells) {
  const lethal = recordDecayingBirthstoneActivity(matchedGroups, incidentalCells);
  if (lethal.length === 0) return false;

  busy = true;
  loseTitleEl.textContent = DIALOG_TITLES.NO_MOVES;
  loseMessageEl.textContent = `The Decaying Birthstone consumes you — final score ${score}`;
  loseDialogEl.classList.remove('hidden');
  return true;
}

/**
 * Adds `gained` to the score, updates the display, and advances the
 * level (possibly more than once) if the new score clears the
 * current target.
 *
 * CHANGED THIS ROUND — Overcharge Essence's per-level gem conversion
 * is added right alongside Perpetual Boon's per-level gain, same
 * "checked once per level this while-loop crosses" placement.
 *
 * @param {number} gained
 * @param {string} popupText
 * @returns {boolean} true if at least one level was cleared.
 */
function applyScoreGain(gained, popupText) {
  if (goldenTicketTurnsRemaining > 0) {
    gained *= 2;
  }

  score += gained;
  scoreEl.textContent = score;

  const levelBeforeGain = progressionState.level;

  let leveledUp = false;
  let eliteOutcome = null;
  let challengeOutcome = null;

  while (score >= progressionState.scoreTarget) {
    if (activeEventState.type === EVENT_TYPE.ELITE && activeEventState.eliteForLevel === progressionState.level) {
      eliteOutcome = resolveEliteOutcome(score);
      if (eliteOutcome && eliteOutcome.scoreDelta) {
        score += eliteOutcome.scoreDelta;
        scoreEl.textContent = score;
      }
    }
    // CHANGED — no longer gated on challengeForLevel === progressionState.level;
    // checkChallengeLevelClear() itself decides whether this level-clear
    // actually resolves the challenge (last level in the window, or a
    // detonation) or should keep tracking silently into the next one.
    if (activeEventState.type === EVENT_TYPE.CHALLENGE) {
      challengeOutcome = checkChallengeLevelClear();
    }
    // NEW — remember WHICH level just got cleared (progression hasn't
    // advanced yet, so this is still the cleared level). Every level
    // this loop crosses gets its own reward in the queue later.
    pendingClearedLevels.push(progressionState.level);

    advanceLevel();
    if (ENABLE_MOVES_LIMIT) {
      moves += LEVEL_UP_BONUS_MOVES;
    }
    leveledUp = true;

    // NEW — Overcharge Essence: "at the start of the level," convert
    // 2 random plain gems into a Laser/Discharger, per copy held.
    const overchargeCount = countActiveBoon('overcharge_essence');
    if (overchargeCount > 0) {
      convertRandomPlainGemsToSpecial(grid, overchargeCount * 2);
      addHistoryEntry('event', 'Overcharge Essence charges up gems on the board.', 'event');
    }

    getActiveCurseDefsByKind('parasite_score_drain').forEach(curseDef => {
      const drained = Math.round(score * curseDef.effect.percent);
      if (drained <= 0) return;
      score -= drained;
      scoreEl.textContent = score;
      addHistoryEntry('event', `${curseDef.name} saps ${drained} score.`, 'negative');
    });

    // NEW — Perpetual Boon: +1% of CURRENT score per copy held, added
    // at the end of every level cleared, same timing/placement as the
    // Crystallized Parasite drain right above (both happen "at the
    // end of the level, before any shop visit" for the exact same
    // reason — this while loop always finishes before
    // proceedAfterBoonPick() ever gets a chance to open the shop).
    const perpetualBoonCount = countActiveBoon('perpetual_boon');
    if (perpetualBoonCount > 0) {
      const gainedFromPerpetual = Math.round(score * 0.01 * perpetualBoonCount);
      if (gainedFromPerpetual > 0) {
        score += gainedFromPerpetual;
        scoreEl.textContent = score;
        addHistoryEntry('event', `Perpetual Boon grants ${signed(gainedFromPerpetual)} score.`, 'positive');
      }
    }
  }

  const tone = gained > 0 ? 'positive' : gained < 0 ? 'negative' : 'neutral';
  addHistoryEntry('score', popupText, tone);

  if (eliteOutcome) {
    renderSideStats();
    addHistoryEntry('event', `Elite result: ${eliteOutcome.resultText}`, eliteOutcome.won ? 'positive' : 'negative');
    pendingEventResult = { title: formatEventTitle(EVENT_TYPE.ELITE, eliteOutcome.name), text: eliteOutcome.resultText };
  }
  if (challengeOutcome && challengeOutcome.resultText) {
    renderSideStats();
    addHistoryEntry('event', `Challenge result: ${challengeOutcome.resultText}`, challengeOutcome.succeeded ? 'positive' : 'negative');
    pendingEventResult = { title: formatEventTitle(EVENT_TYPE.CHALLENGE, challengeOutcome.name), text: challengeOutcome.resultText };
  }
  if (eliteOutcome || challengeOutcome) {
    updateObjectiveBanner();
  }

  if (leveledUp) {
    levelEl.textContent = progressionState.level;
    targetEl.textContent = progressionState.scoreTarget;
    movesEl.textContent = moves;
    messageEl.textContent = '';
    const clearedLabel = progressionState.level - levelBeforeGain > 1
      ? `Level ${levelBeforeGain}-${progressionState.level - 1}`
      : `Level ${levelBeforeGain}`;
    addHistoryEntry('score', `${clearedLabel} cleared! Moving to Level ${progressionState.level}.`, 'levelup');
  } else {
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
 * Click/tap handler for a board cell.
 *
 * @param {number} r
 * @param {number} c
 * @returns {void}
 */
function onCellClick(r, c) {
  if (busy) return;

  if (pendingConsumableEntry) {
    handleConsumableTargetClick(r, c);
    return;
  }

  if (placementMode) {
    handlePlacementClick(r, c);
    return;
  }

  if (grid[r][c] === BLOCKED) return;
  // NEW — Obsidian can never be selected or swapped; it can only
  // leave the board by falling off the bottom row on its own (see
  // gameplay/obsidian.js).
  if (grid[r][c] === OBSIDIAN) return;

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
 * Drag/swipe handler for a board cell.
 *
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @returns {void}
 */
function onCellDragSwap(r1, c1, r2, c2) {
  if (busy) return;
  if (placementMode) return;
  if (pendingConsumableEntry) return;

  if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) return;
  if (grid[r1][c1] === BLOCKED || grid[r2][c2] === BLOCKED) return;
  // NEW — same Obsidian guard as onCellClick(), for the drag path.
  if (grid[r1][c1] === OBSIDIAN || grid[r2][c2] === OBSIDIAN) return;

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
 * Shared tail-end for every swap-ACTIVATED special-gem combo,
 * including Frantic Star's self-activation.
 *
 * @param {[number, number][]} clearedCells
 * @param {number} gained
 * @param {string} popupText
 * @returns {void}
 */
function finishSwapActivatedCombo(clearedCells, gained, popupText, matchedGroups = [], incidentalCells = []) {
  markChallengeDetonation();
  recordEliteGemActivity(matchedGroups, incidentalCells, 1);
  if (checkDecayingBirthstoneLethal(matchedGroups, incidentalCells)) return;
  updateObjectiveBanner();

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
 * Hyperstar + a plain normal gem — classic same-color wipe. Frantic
 * Star: if held, also wipes a second random gem color.
 *
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} targetGemType
 * @returns {void}
 */
function handleHyperstarSingle(hyperRow, hyperCol, targetGemType) {
  const franticStarActive = isBoonActive('frantic_star');
  // The plain color wipe (target color, plus Frantic Star's extra color).
  const baseCleared = triggerHyperstarSingle(grid, hyperRow, hyperCol, targetGemType, franticStarActive);
  // Fire any special gem the wipe caught (e.g. your Laser Ruby).
  const clearedCells = expandChainReaction(grid, baseCleared, currentSwapKeys);
  const hyperstarOwnGemType = grid[hyperRow][hyperCol];

  // Wiped cells still score as one matched group; the chain-reaction
  // extras score as flat incidental cells.
  const wipedCells = baseCleared.filter(([r, c]) => !(r === hyperRow && c === hyperCol));
  const baseKeys = new Set(baseCleared.map(([r, c]) => `${r},${c}`));
  const extraCells = clearedCells.filter(([r, c]) => !baseKeys.has(`${r},${c}`));

  const matchedGroups = [{ gemType: targetGemType, length: wipedCells.length }];
  const incidentalCells = [
    { gemType: hyperstarOwnGemType, row: hyperRow, col: hyperCol },
    ...extraCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c })),
  ];

  const gained = calculateCascadeStepScore({ matchedGroups, incidentalCells, comboCount: 1 });
  const label = franticStarActive ? 'Frantic Hyperstar Wipe' : 'Hyperstar Wipe';
  finishSwapActivatedCombo(clearedCells, gained, `${label}: ${signed(gained)}`, matchedGroups, incidentalCells);
}

/**
 * Hyperstar + Laser — convert-and-detonate combo.
 *
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} laserColorType
 * @returns {void}
 */
function handleHyperstarLaserCombo(hyperRow, hyperCol, laserColorType) {
  const clearedCells = expandChainReaction(grid, triggerHyperstarLaserCombo(grid, hyperRow, hyperCol, laserColorType), currentSwapKeys);
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));
  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });
  finishSwapActivatedCombo(clearedCells, gained, `Hyperstar Laser Combo: ${signed(gained)}`, [], incidentalCells);
}

/**
 * Hyperstar + Discharger — convert-and-detonate combo.
 *
 * @param {number} hyperRow
 * @param {number} hyperCol
 * @param {number} dischargerColorType
 * @returns {void}
 */
function handleHyperstarDischargerCombo(hyperRow, hyperCol, dischargerColorType) {
  const clearedCells = expandChainReaction(grid, triggerHyperstarDischargerCombo(grid, hyperRow, hyperCol, dischargerColorType), currentSwapKeys);
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));
  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });
  finishSwapActivatedCombo(clearedCells, gained, `Hyperstar Discharger Combo: ${signed(gained)}`, [], incidentalCells);
}

/**
 * Hyperstar + Hyperstar — clears the whole board.
 *
 * @returns {void}
 */
function handleHyperstarDouble() {
  const clearedCells = triggerHyperstarDouble(grid);
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));
  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });
  finishSwapActivatedCombo(clearedCells, gained, `Double Hyperstar: ${signed(gained)}`, [], incidentalCells);
}

/**
 * Laser + Laser — combined row+column blast through the swap's
 * destination cell.
 *
 * @param {number} originRow
 * @param {number} originCol
 * @returns {void}
 */
function handleLaserCombo(originRow, originCol) {
  const clearedCells = expandChainReaction(grid, triggerLaserCombo(grid, originRow, originCol), currentSwapKeys);
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));
  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });
  finishSwapActivatedCombo(clearedCells, gained, `Laser Combo: ${signed(gained)}`, [], incidentalCells);
}

/**
 * Discharger + Laser — clears 3 rows or 3 columns.
 *
 * @param {number} dischargerRow
 * @param {number} dischargerCol
 * @param {string} laserOrientation
 * @returns {void}
 */
function handleDischargerLaserCombo(dischargerRow, dischargerCol, laserOrientation) {
  const clearedCells = expandChainReaction(grid, triggerDischargerLaserCombo(grid, dischargerRow, dischargerCol, laserOrientation), currentSwapKeys);
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));
  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });
  finishSwapActivatedCombo(clearedCells, gained, `Discharger Laser Combo: ${signed(gained)}`, [], incidentalCells);
}

/**
 * Discharger + Discharger — the row+column+diagonals burst.
 *
 * @param {number} originRow
 * @param {number} originCol
 * @returns {void}
 */
function handleDischargerDouble(originRow, originCol) {
  const clearedCells = expandChainReaction(grid, triggerDischargerDouble(grid, originRow, originCol), currentSwapKeys);
  const incidentalCells = clearedCells.map(([r, c]) => ({ gemType: grid[r][c], row: r, col: c }));
  const gained = calculateCascadeStepScore({ matchedGroups: [], incidentalCells, comboCount: 1 });
  finishSwapActivatedCombo(clearedCells, gained, `Double Discharger: ${signed(gained)}`, [], incidentalCells);
}

/**
 * Attempts to swap two adjacent cells.
 *
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @returns {void}
 */
function attemptSwap(r1, c1, r2, c2) {
  busy = true;
  selected = null;
  pendingGoldenTicketTurn = true;
  // Remember both swapped cells so combo chain reactions don't re-fire them.
  currentSwapKeys = new Set([`${r1},${c1}`, `${r2},${c2}`]);

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

    if (hyperAt1 && hyperAt2) {
      handleHyperstarDouble();
      return;
    }

    if ((hyperAt1 && laserAt2) || (hyperAt2 && laserAt1)) {
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const laserColorType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarLaserCombo(hyperRow, hyperCol, laserColorType);
      return;
    }

    if ((hyperAt1 && dischargerAt2) || (hyperAt2 && dischargerAt1)) {
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const dischargerColorType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarDischargerCombo(hyperRow, hyperCol, dischargerColorType);
      return;
    }

    if (hyperAt1 || hyperAt2) {
      const hyperRow = hyperAt1 ? r2 : r1;
      const hyperCol = hyperAt1 ? c2 : c1;
      const targetGemType = hyperAt1 ? preSwapType2 : preSwapType1;
      handleHyperstarSingle(hyperRow, hyperCol, targetGemType);
      return;
    }

    if (laserAt1 && laserAt2) {
      handleLaserCombo(r2, c2);
      return;
    }

    if ((dischargerAt1 && laserAt2) || (dischargerAt2 && laserAt1)) {
      const dischargerRow = dischargerAt1 ? r2 : r1;
      const dischargerCol = dischargerAt1 ? c2 : c1;
      const laserOrientation = dischargerAt1 ? preSwapSpecial2 : preSwapSpecial1;
      handleDischargerLaserCombo(dischargerRow, dischargerCol, laserOrientation);
      return;
    }

    if (dischargerAt1 && dischargerAt2) {
      handleDischargerDouble(r2, c2);
      return;
    }

    const matched = findMatches(grid, isHyperstarCell);

    if (!hasAnyMatch(matched)) {
      pendingGoldenTicketTurn = false;
      messageEl.textContent = MESSAGES.INVALID_SWAP;
      const revertPitch = computeCellPitch(boardEl);
      swap(grid, r1, c1, r2, c2);
      swap(specialGemState.grid, r1, c1, r2, c2);
      renderBoardWithInteractions();
      animateSwap(boardEl, r1, c1, r2, c2, revertPitch);
      setTimeout(() => {
        busy = false;
        scheduleHintTimer();
      }, SWAP_ANIM_MS);
      return;
    }

    if (ENABLE_MOVES_LIMIT) {
      moves--;
      movesEl.textContent = moves;
    }
    messageEl.textContent = '';
    comboCount = 0;
    resolveMatches([[r1, c1], [r2, c2]]);
  }, SWAP_ANIM_MS);
}

/**
 * Recursive-by-timeout loop: pop current matches, award combo-scaled
 * score, check for a level-up, collapse+refill, then check for new
 * matches caused by the fall (cascades).
 *
 * CHANGED THIS ROUND — the settle branch now ALSO runs
 * applyChallengeDecayIfActive() (A Test of Endurance) as the very
 * first thing, before Frantic Star's self-activation check.
 *
 * @param {[[number, number], [number, number]] | null} [swapCells]
 * @returns {void}
 */
function resolveMatches(swapCells = null) {
  const matched = findMatches(grid, isHyperstarCell);

  if (!hasAnyMatch(matched)) {
    applyChallengeDecayIfActive();

    if (maybeTriggerFranticStarSelfActivation()) return;

    if (pendingGoldenTicketTurn) {
      pendingGoldenTicketTurn = false;
      consumeGoldenTicketTurnIfActive();
    }

    if (pendingLevelUp) {
      pendingLevelUp = false;

      const eventResult = pendingEventResult;
      pendingEventResult = null;

      // CHANGED — instead of a single level-up dialog, run the whole
      // queue: one reward (+ shop when due) per cleared level, in
      // order, then the event roll, then hand control back.
      const proceedToLevelUp = () => {
        runLevelUpQueue(() => {
          busy = false;
          checkEndState();
        });
      };

      if (eventResult) {
        showEliteChallengeResultDialog(eventResult, proceedToLevelUp);
      } else {
        proceedToLevelUp();
      }
      return;
    }

    busy = false;
    checkEndState();
    return;
  }
  comboCount++;

  const { clearedCells, spawns, matchedGroups, incidentalCells, obsidianSpawn } = resolveSpecialGems(grid, matched, swapCells);

  // NEW — log an Obsidian spawn to the history panel, if one happened
  // this step (purely informational; no dedicated pop animation for
  // it — it just quietly appears the next time the board re-renders).
  if (obsidianSpawn) {
    addHistoryEntry('event', 'An Obsidian gem forms on the board.', 'event');
  }

  recordEliteGemActivity(matchedGroups, incidentalCells, comboCount);
  // NEW — Decaying Birthstone lethal check, same call-site convention
  // as recordEliteGemActivity() right above.
  if (checkDecayingBirthstoneLethal(matchedGroups, incidentalCells)) return;
  updateObjectiveBanner();

  if (incidentalCells.length > 0) {
    markChallengeDetonation();
    updateObjectiveBanner();
  }
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
 * next cascade check.
 *
 * CHANGED THIS ROUND — after every collapseAndFill() pass, also runs
 * settleObsidianOffBoard(): any Obsidian gem that ended up at the
 * true bottom of its column crumbles off the board, and everything
 * above it re-settles.
 *
 * @param {[number, number][]} clearedCells
 * @returns {void}
 */
function continueCascadeAfterMatch(clearedCells) {
  setTimeout(() => {
    clearedCells.forEach(([r, c]) => { grid[r][c] = -1; });

    clearSpecialGems(clearedCells);

    collapseAndFill(grid, [specialGemState.grid]);

    // NEW — Obsidian "falls off the board" cleanup, right after the
    // normal gravity pass.
    const obsidianFellOff = settleObsidianOffBoard(grid, [specialGemState.grid]);
    if (obsidianFellOff) {
      addHistoryEntry('event', 'An Obsidian gem crumbles off the edge of the board.', 'event');
      renderHistoryPanel();
    }

    renderBoardWithInteractions();
    setTimeout(resolveMatches, CASCADE_CHECK_DELAY_MS);
  }, MATCH_CLEAR_DELAY_MS);
}

/**
 * NEW — walks every level cleared by the last score gain, in order.
 * For each level: "Level N Cleared!" dialog -> boon pick (+ Booner
 * bonus offer) -> shop if N is a shop level -> (tile placement if the
 * boon needs one). Only after the LAST level does the random event
 * roll happen, since Elite/Challenge attach to the level about to be
 * played, not to one that was skipped through.
 *
 * @param {() => void} onAllDone - called once the queue and the
 *   event roll have completely finished.
 * @returns {void}
 */
function runLevelUpQueue(onAllDone) {
  // Copy then empty the shared list so nothing re-processes it.
  const queue = pendingClearedLevels.slice();
  pendingClearedLevels.length = 0;

  const processNext = () => {
    // Queue exhausted -> roll the (single) event, then finish.
    if (queue.length === 0) {
      attemptEvent(onAllDone);
      return;
    }

    const clearedLevel = queue.shift();
    // Reset the once-per-level shop guard for this new level.
    shopOpenedForLevel = null;
    showLevelUpDialog(clearedLevel, processNext);
  };

  processNext();
}

/**
 * Shows the "Level N Cleared!" dialog for one queued level.
 *
 * @param {number} clearedLevel - the level this dialog/reward is for.
 * @param {() => void} onContinue - called after this level's boon
 *   pick and shop (if any) are fully done.
 * @returns {void}
 */
function showLevelUpDialog(clearedLevel, onContinue) {
  pendingContinuation = onContinue;
  pendingLevelUpClearedLevel = clearedLevel;
  // Interpolated text stays in main.js (Rule 7).
  levelUpTitleEl.textContent = `Level ${clearedLevel} Cleared!`;
  levelUpDialogEl.classList.remove('hidden');
}


// ============================================================
// DISABLED — Booner's old "second boon dialog" behavior.
// Replaced by the 4th-card design inside showBoonDialog().
// To restore: uncomment this function AND bring back the
// `isBonusOffer` parameter + the maybeGrantBoonerBonusOffer()
// call in showBoonDialog()'s card click handler, and remove the
// 4th-card roll at the top of showBoonDialog() so Booner doesn't
// apply twice. Also revert Booner's description in boon.js.
// ============================================================

/**
 * Booner's stacking chance of an extra boon offer (unchanged logic).
 * CHANGED — takes `clearedLevel` so the bonus offer is gated by the
 * same level as the normal offer it follows.
 *
 * @param {() => void} onDone
 * @param {number} clearedLevel
 * @returns {void}
 */
/*nction maybeGrantBoonerBonusOffer(onDone, clearedLevel) {
  const boonerCount = countActiveBoon('booner');
  if (boonerCount === 0 || Math.random() >= 0.25 * boonerCount) {
    onDone();
    return;
  }

  addHistoryEntry('event', 'Booner grants a bonus boon offer!', 'event');
  renderHistoryPanel();
  showBoonDialog(onDone, clearedLevel, true); // isBonusOffer=true — never re-rolls Booner itself
}*/

/**
 * Builds and shows the pick-one boon dialog for one cleared level.
 *
 * CHANGED — Booner no longer opens a second dialog. Its chance is
 * rolled ONCE here, and a successful roll simply makes this same
 * dialog offer 4 cards instead of 3. Chance is 25% per copy held.
 * There is now also a Skip button that takes no boon.
 *
 * @param {() => void} onContinue - next queued level (or event roll).
 * @param {number} clearedLevel - the level this reward is FOR.
 * @returns {void}
 */
function showBoonDialog(onContinue, clearedLevel) {
  // Roll Booner's bonus card once, up front. With no Booner held,
  // boonerCount is 0 and the roll is skipped entirely.
  const boonerCount = countActiveBoon('booner');
  const boonerTriggered = boonerCount > 0 && Math.random() < 0.25 * boonerCount;
  const offerSize = boonerTriggered ? 4 : 3;

  // Offer is generated against the level being rewarded, NOT the
  // (possibly much higher) current level.
  const offer = generateBoonOffer(offerSize, clearedLevel);

  if (offer.length === 0) {
    onContinue();
    return;
  }

  if (boonerTriggered) {
    addHistoryEntry('event', 'Booner adds a 4th option to the reward!', 'event');
    renderHistoryPanel();
  }

  // 4 cards need a wider dialog box than 3 do.
  boonDialogEl.querySelector('.boon-dialog-box')
    .classList.toggle('boon-dialog-box--wide', offer.length > 3);

  boonChoicesEl.innerHTML = '';
  offer.forEach(def => {
    const card = document.createElement('div');
    card.className = `boon-card boon-card--${def.rarity}`;

    const gemDef = def.effect?.gem ? ALL_GEM_CATALOG.find(g => g.id === def.effect.gem) : null;
    const iconHtml = gemDef
      ? `<img class="boon-card-gem-icon" src="css/model/svg/${gemDef.file}" alt="${gemDef.name}">`
      : '';

    card.innerHTML = `
      <div class="boon-card-header">
        ${iconHtml}
        <h3>${def.name}</h3>
      </div>
      <p class="boon-card-desc">${def.description}</p>
      <div class="boon-card-footer">
        <span class="boon-card-rarity">${def.rarity}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      const activeBoon = pickBoon(def.id);
      activeBoon.appliedEffect = applyBoonEffect(def);
      renderSideStats();
      boonDialogEl.classList.add('hidden');

      // The name is a hover-tooltip span (description lives in the tooltip).
      // For boons that roll random gems, a second line names the chosen
      // gems. Both parts share ONE entry so the panel's newest-first
      // ordering can't flip them apart.
      addHistoryEntry(
        'boon',
        `Boon picked: ${formatNamedEffectSpan(def)}${buildRandomGemTargetLine(activeBoon.appliedEffect)}`,
        'boon'
      );
      renderHistoryPanel();

      // Shop (if due) and board placement (if needed) come next.
      proceedAfterBoonPick(def, onContinue, clearedLevel);
    });

    boonChoicesEl.appendChild(card);
  });

  // Skip button. Assigned with .onclick (not addEventListener) so each
  // time this dialog opens it REPLACES the previous handler instead of
  // stacking one more on top.
  boonSkipBtn.onclick = () => {
    boonDialogEl.classList.add('hidden');

    addHistoryEntry('boon', 'Boon reward skipped.', 'neutral');
    renderHistoryPanel();

    // No boon was picked, so pass null. The shop still opens if this
    // cleared level is a shop level, since that depends on the level,
    // not on the pick.
    proceedAfterBoonPick(null, onContinue, clearedLevel);
  };

  boonDialogEl.classList.remove('hidden');
}

/**
 * Decides what happens right after a level-up boon pick resolves.
 *
 * CHANGED THIS ROUND:
 *   - Uses `clearedLevel` (the level this reward is for) for the shop
 *     check instead of progressionState.level - 1, which is wrong
 *     while several queued rewards are being processed.
 *   - No longer rolls the random event itself — runLevelUpQueue() does
 *     that once, after the LAST queued level.
 *
 * @param {object} def
 * @param {() => void} onContinue - next queued level (or event roll).
 * @param {number} clearedLevel
 * @returns {void}
 */
function proceedAfterBoonPick(def, onContinue, clearedLevel) {
  const isBoardShapeBoon =
    def.effect.kind === 'board_expand' ||
    def.effect.kind === 'board_shrink' ||
    def.effect.kind === 'board_expand_and_shrink';

  // After the shop (or after skipping it): board-shape boons still
  // need their placement step; everything else moves straight on.
  const afterShop = () => {
    if (isBoardShapeBoon) {
      startTilePlacement(def, onContinue);
    } else {
      onContinue();
    }
  };

  // NEW — if the shop already opened for THIS cleared level (a Booner
  // bonus pick got here first), don't open it again. Still run this
  // pick's own placement check, then continue.
  if (shopOpenedForLevel === clearedLevel) {
    afterShop();
    return;
  }

  // Shop opens per queued level, so a 4 -> 11 jump visits the shop
  // after level 5's reward AND after level 10's reward.
  if (shouldOpenShop(clearedLevel)) {
    shopOpenedForLevel = clearedLevel; // mark this level as "shop already handled"
    openShopDialog(afterShop, clearedLevel);
  } else {
    afterShop();
  }
}

/**
 * Opens the shop for one cleared level.
 *
 * CHANGED THIS ROUND — takes `clearedLevel`; tier, boon offer and the
 * Limited Edition slot are all derived from it rather than from
 * progressionState.level.
 *
 * @param {() => void} onContinue
 * @param {number} clearedLevel
 * @returns {void}
 */
function openShopDialog(onContinue, clearedLevel) {
  currentShopTier = shopTierForLevel(clearedLevel);
  shopEntryScore = score; // pricing snapshot, unchanged
  rollBoonShopOffer(clearedLevel);
  rollConsumableShopOffer();
  resetCustomerServiceVisit();
  rollLimitedEditionBoonOffer(clearedLevel);
  curseRemovalPickerOpen = false;
  shopContinuation = onContinue;
  renderShopDialog();
  shopDialogEl.classList.remove('hidden');
}

/**
 * Rebuilds the shop's card grid.
 *
 * CHANGED THIS ROUND:
 *   - Boon cards now use the SAME `.boon-card` markup/styling the
 *     level-up dialog's cards use, with the price added into the
 *     existing footer row (alongside the rarity badge).
 *   - Consumable cards are now belt-style squares with a hover
 *     tooltip, price shown below (same convention/location as before).
 *   - New Customer Service section, rendered via
 *     renderCustomerServiceSection().
 *   - Every price now goes through applyVipDiscount().
 *
 * @returns {void}
 */
function renderShopDialog() {
  // The squares are rebuilt below, and a destroyed element never fires
  // mouseout, so clear any tooltip left on screen from a hovered square.
  hideFloatingTooltip();

  shopSubtitleEl.textContent = `Your score: ${score}`;
  shopChoicesEl.innerHTML = '';

  boonShopState.offer.forEach(def => {
    const rawPrice = calculateBoonPrice(def.rarity, currentShopTier, shopEntryScore);
    const price = applyVipDiscount(rawPrice);
    const alreadyBought = isBoonPurchasedThisVisit(def.id);
    const canAfford = score >= price;

    const card = document.createElement('div');
    // CHANGED — reuses the level-up dialog's own card class instead
    // of the old smaller `.shop-card`.
    card.className = `boon-card boon-card--${def.rarity}`;
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
      <p class="boon-card-desc">${def.description}</p>
      <div class="boon-card-footer">
        <span class="boon-card-rarity">${def.rarity}</span>
        <span class="shop-card-price">${alreadyBought ? 'Purchased' : `${price} pts`}</span>
      </div>
    `;

    if (!alreadyBought && canAfford) {
      card.addEventListener('click', () => buyBoonFromShop(def, price));
    }

    shopChoicesEl.appendChild(card);
  });

  // CHANGED — consumables render as belt-style squares (icon only,
  // hover tooltip), price shown below in the same spot as before.
  consumableShopChoicesEl.innerHTML = '';
  consumableShopState.offer.forEach(type => {
    const info = CONSUMABLE_INFO[type];
    const rawPrice = calculateConsumablePrice(type, shopEntryScore);
    const price = applyVipDiscount(rawPrice);
    const alreadyBought = isConsumablePurchasedThisVisit(type);
    const beltFull = !hasBeltSpace();
    const canAfford = score >= price;

    const wrapper = document.createElement('div');
    wrapper.className = 'consumable-shop-item';

    const square = document.createElement('div');
    square.className = 'consumable-shop-square';
    if (alreadyBought || !canAfford || beltFull) square.classList.add('consumable-shop-square--unaffordable');
    square.dataset.tooltip = `${info.name} — ${info.description}`;

    const icon = document.createElement('div');
    icon.className = 'consumable-shop-icon';
    icon.style.backgroundImage = `url('css/model/svg/consumables/${info.file}')`;
    square.appendChild(icon);

    if (!alreadyBought && canAfford && !beltFull) {
      square.addEventListener('click', () => buyConsumableFromShop(type, price));
    }

    const priceEl = document.createElement('div');
    priceEl.className = 'shop-card-price';
    priceEl.textContent = alreadyBought ? 'Purchased' : beltFull ? 'Belt full' : `${price} pts`;

    wrapper.appendChild(square);
    wrapper.appendChild(priceEl);
    consumableShopChoicesEl.appendChild(wrapper);
  });

  renderCustomerServiceSection(); // NEW
}

/**
 * NEW — rebuilds the Customer Service section: either the two
 * service cards (Curse Removal / Limited Edition Boons Sale), or —
 * if curseRemovalPickerOpen is true — the curse-selection list
 * instead (see renderCurseRemovalPicker()).
 *
 * @returns {void}
 */
function renderCustomerServiceSection() {
  customerServiceChoicesEl.innerHTML = '';

  if (curseRemovalPickerOpen) {
    renderCurseRemovalPicker();
    return;
  }

  const locked = customerServiceState.usedThisVisit;

  // --- Curse Removal Service ---
  const curseCard = document.createElement('div');
  curseCard.className = 'customer-service-card';
  const hasCurses = curseState.activeCurses.length > 0;
  const cursePrice = applyVipDiscount(calculateCurseRemovalPrice(shopEntryScore));
  const curseClickable = hasCurses && !locked && score >= cursePrice;

  curseCard.innerHTML = `
    <h4>Curse Removal Service</h4>
    <p>Select and remove one active curse.</p>
    <div class="shop-card-price">${!hasCurses ? 'Not available' : locked ? 'Already used this visit' : `${cursePrice} pts`}</div>
  `;
  if (curseClickable) {
    curseCard.addEventListener('click', () => {
      curseRemovalPickerOpen = true;
      renderCustomerServiceSection();
    });
  } else {
    curseCard.classList.add('customer-service-card--disabled');
  }

  // --- Limited Edition Boons Sale Service ---
  const saleCard = document.createElement('div');
  saleCard.className = 'customer-service-card';
  const boonDef = customerServiceState.limitedEditionBoonId
    ? BOON_POOL.find(d => d.id === customerServiceState.limitedEditionBoonId)
    : null;
  const salePrice = boonDef ? applyVipDiscount(calculateBoonPrice(boonDef.rarity, currentShopTier, shopEntryScore)) : 0;
  const saleClickable = !!boonDef && !locked && score >= salePrice;

  saleCard.innerHTML = `
    <h4>Limited Edition Boons Sale</h4>
    <p>${boonDef ? `${boonDef.name} — ${boonDef.description}` : 'No shop-exclusive boons are currently available.'}</p>
    <div class="shop-card-price">${!boonDef ? 'Out Of Service' : locked ? 'Already used this visit' : `${salePrice} pts`}</div>
  `;
  if (saleClickable) {
    saleCard.addEventListener('click', () => buyLimitedEditionBoon(boonDef, salePrice));
  } else {
    saleCard.classList.add('customer-service-card--disabled');
  }

  customerServiceChoicesEl.appendChild(curseCard);
  customerServiceChoicesEl.appendChild(saleCard);
}

/**
 * NEW — the curse-selection list shown after clicking "Curse Removal
 * Service": one row per currently active curse, each with its own
 * "Remove" button, plus a "Cancel" button to back out without buying
 * anything.
 *
 * @returns {void}
 */
function renderCurseRemovalPicker() {
  const price = applyVipDiscount(calculateCurseRemovalPrice(shopEntryScore));

  const heading = document.createElement('p');
  heading.className = 'curse-picker-heading';
  heading.textContent = `Select a curse to remove (${price} pts):`;
  customerServiceChoicesEl.appendChild(heading);

  curseState.activeCurses.forEach(activeCurse => {
    const def = CURSE_POOL.find(c => c.id === activeCurse.id);
    if (!def) return;

    const row = document.createElement('div');
    row.className = 'curse-picker-row';

    const label = document.createElement('span');
    label.textContent = `${def.name} — ${def.description}`;
    row.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.disabled = score < price;
    removeBtn.addEventListener('click', () => {
      removeCurseViaService(activeCurse.pickId);
      score -= price;
      scoreEl.textContent = score;
      renderSideStats();
      addHistoryEntry('boon', `Removed curse via Customer Service: ${def.name} (-${price})`, 'boon');
      renderHistoryPanel();
      curseRemovalPickerOpen = false;
      renderShopDialog();
    });
    row.appendChild(removeBtn);

    customerServiceChoicesEl.appendChild(row);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'curse-picker-cancel';
  cancelBtn.addEventListener('click', () => {
    curseRemovalPickerOpen = false;
    renderCustomerServiceSection();
  });
  customerServiceChoicesEl.appendChild(cancelBtn);
}

/**
 * NEW — buys the currently-offered Limited Edition boon.
 *
 * @param {object} def
 * @param {number} price
 * @returns {void}
 */
function buyLimitedEditionBoon(def, price) {
  if (score < price) return;

  score -= price;
  scoreEl.textContent = score;

  const activeBoon = pickBoon(def.id);
  activeBoon.appliedEffect = applyBoonEffect(def);
  markCustomerServiceUsed();

  addHistoryEntry('boon', `Bought from Customer Service: ${def.name} (-${price}) — ${def.description}`, 'boon');
  renderHistoryPanel();
  renderSideStats();
  renderShopDialog();
}

/**
 * Attempts to buy one boon from the current shop offer.
 *
 * @param {object} def
 * @param {number} price
 * @returns {void}
 */
function buyBoonFromShop(def, price) {
  if (score < price) return;

  score -= price;
  scoreEl.textContent = score;

  const activeBoon = pickBoon(def.id);
  activeBoon.appliedEffect = applyBoonEffect(def);
  markBoonPurchased(def.id);

  // Same format as a free pick: name span with tooltip, price after it,
  // then the random-gem line (if this boon rolls random gems).
  addHistoryEntry(
    'boon',
    `Bought from shop: ${formatNamedEffectSpan(def)} (-${price})${buildRandomGemTargetLine(activeBoon.appliedEffect)}`,
    'boon'
  );
  renderHistoryPanel();

  renderSideStats();
  renderShopDialog();
}

/**
 * The Resurrection Cross's actual reshuffle-and-consume step.
 *
 * @param {object} entry
 * @param {string} messageHtml
 * @returns {void}
 */
function triggerResurrectionCross(entry, messageHtml) {
  removeConsumableFromInventory(entry.pickId);
  renderConsumableBelt();
  messageEl.innerHTML = messageHtml;
  setTimeout(() => {
    rebuildGridRespectingBlocked(grid);
    resetSpecialGems();
    renderBoardWithInteractions();
    busy = false;
    scheduleHintTimer();
    // NEW — re-check afterward. Per design ("if after using it, they
    // are still deadlocked, repeat the process"), a fresh reshuffle
    // should essentially never still be stuck, but this makes the
    // whole flow self-correcting for free if it somehow ever is —
    // checkEndState() will just fall through to the "no Resurrection
    // Cross left" branch, since this one was already consumed above.
    checkEndState();
  }, 400);
}

/**
 * Shown when the board is stuck AND the player holds BOTH a
 * Resurrection Cross AND at least one other board-changing consumable.
 *
 * @returns {void}
 */
function showDeadlockChoiceDialog() {
  busy = true;
  deadlockMessageEl.innerHTML =
    `There are no more valid moves. Would you like to use one of your consumable items first, before your ` +
    `${formatConsumableNameSpan(CONSUMABLE_TYPE.RESURRECTION_CROSS)} activates?`;
  deadlockDialogEl.classList.remove('hidden');
}

/**
 * The single place that decides what happens when the board is stuck.
 *
 * @returns {void}
 */
function handleDeadlock() {
  const resurrectionCross = findFirstConsumableOfType(CONSUMABLE_TYPE.RESURRECTION_CROSS);

  if (!resurrectionCross) {
    // No safety net at all — same behavior the game always had.
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

  // The player holds a Resurrection Cross — they get a second chance.
  const hasBoardChangingConsumable = consumableState.inventory.some(
    e => BOARD_CHANGING_CONSUMABLE_TYPES.includes(e.type)
  );

  if (!hasBoardChangingConsumable) {
    // Nothing else they could try first — just inform them and
    // trigger the Cross directly.
    triggerResurrectionCross(
      resurrectionCross,
      `There are no more valid moves, but you are given a second chance by your ` +
      `${formatConsumableNameSpan(CONSUMABLE_TYPE.RESURRECTION_CROSS)}! Reshuffling...`
    );
    return;
  }

  // They hold at least one board-changing consumable too — offer the choice.
  showDeadlockChoiceDialog();
}

/**
 * Called once a swap's cascade sequence has fully settled AND (if
 * this run leveled up) the level-up dialog/boon pick has finished.
 * Reshuffles the board if no legal move remains, otherwise shows the
 * normal prompt.
 *
 * CHANGED THIS ROUND — the stuck-board branch now delegates entirely
 * to handleDeadlock() instead of inlining the Resurrection Cross
 * check here.
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
    handleDeadlock();
    return;
  }

  messageEl.textContent = MESSAGES.SELECT_PROMPT;
  scheduleHintTimer();
}

/**
 * Shows the lose dialog with the final score/target.
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
  // Pass along WHICH level this reward is for so rarity gates use it.
  showBoonDialog(pendingContinuation, pendingLevelUpClearedLevel);
});
shopLeaveBtn.addEventListener('click', () => {
  hideFloatingTooltip(); // don't leave a tooltip behind when the dialog closes
  shopDialogEl.classList.add('hidden');
  const finish = shopContinuation;
  shopContinuation = null;
  if (finish) finish();
});

// NEW — the deadlock-choice dialog's Yes/No buttons.
deadlockYesBtn.addEventListener('click', () => {
  deadlockDialogEl.classList.add('hidden');
  // The player wants to try a board-changing consumable first. Leave
  // `busy` false so they can actually click a belt slot / target a
  // cell — the normal consumable-use flow already ends by calling
  // checkEndState() again on its own (either directly, when nothing
  // was cleared, or via continueCascadeAfterMatch()'s eventual
  // settle), which is exactly what re-runs this whole deadlock check
  // afterward — "if after using it, they are still deadlocked,
  // repeat the process" falls out of that for free, with no extra
  // bookkeeping needed here.
  busy = false;
  messageEl.textContent = 'Select a consumable item to use.';
});

deadlockNoBtn.addEventListener('click', () => {
  deadlockDialogEl.classList.add('hidden');
  const resurrectionCross = findFirstConsumableOfType(CONSUMABLE_TYPE.RESURRECTION_CROSS);
  if (!resurrectionCross) { busy = false; checkEndState(); return; }
  triggerResurrectionCross(
    resurrectionCross,
    `Your ${formatConsumableNameSpan(CONSUMABLE_TYPE.RESURRECTION_CROSS)} saves the run — reshuffling...`
  );
});

// Event delegation: History rows are rebuilt on every entry, so listen
// once on the container instead of on each span.
historyListEl.addEventListener('mouseover', (e) => {
  const nameSpan = e.target.closest('.event-inline-name');
  if (nameSpan) showFloatingTooltip(nameSpan);
});
historyListEl.addEventListener('mouseout', (e) => {
  if (e.target.closest('.event-inline-name')) hideFloatingTooltip();
});

// Scrolling moves the name out from under a fixed tooltip, so hide it.
// The scroll container is the panel itself, not the inner list.
document.getElementById('history-panel').addEventListener('scroll', hideFloatingTooltip);

// --- Shop consumable squares: same floating tooltip as History. ---
// The shop dialog scrolls (overflow-y: auto), which clips the CSS
// tooltip, so hover is handled here instead. Delegation on the
// container works because renderShopDialog() rebuilds the squares
// every render.
consumableShopChoicesEl.addEventListener('mouseover', (e) => {
  // closest() so hovering the inner icon div also counts as hovering the square.
  const square = e.target.closest('.consumable-shop-square');
  if (square) showFloatingTooltip(square); // reads the square's data-tooltip
});
consumableShopChoicesEl.addEventListener('mouseout', (e) => {
  if (e.target.closest('.consumable-shop-square')) hideFloatingTooltip();
});

// Scrolling the shop moves the square out from under a fixed tooltip,
// so hide it. The scroll container is the dialog box itself.
shopDialogEl.querySelector('.shop-dialog-box').addEventListener('scroll', hideFloatingTooltip);

applyStaticText();
applyMovesLimitVisibility();
showStartScreen();