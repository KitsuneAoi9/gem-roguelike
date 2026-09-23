// ============================================================
// EVENT.JS (gameplay) — Encounter/Elite/Challenge trigger, offer
// building, and outcome resolution.
//
// REWORKED THIS ROUND — the Elite section is a full rewrite. The old
// single-shape Gem Elitist is gone; three structurally different
// fights now share one generalized engine driven entirely by each
// ELITE_POOL entry's `winCondition`/`onWin`/`onLose`/`decline` tagged
// unions (see resources/event/event.js's file header). Encounter/
// Challenge sections below are UNCHANGED from the prior round.
// ============================================================

import { BOON_POOL, BOON_RARITY } from '../resources/boon/boon.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { activeEventState, eventState } from '../resources/event/event_state.js';
import {
  EVENT_TYPE, EVENT_TYPE_WEIGHTS, EVENT_CHANCE_LADDER,
  ENCOUNTER_POOL, ELITE_POOL, CHALLENGE_POOL,
} from '../resources/event/event.js';
import { CURSE_POOL } from '../resources/curse/curse.js';
import { GEM_DEFINITIONS } from '../resources/constant/constants.js';
import { progressionState } from '../resources/progression/progression.js';
import { boonState } from '../resources/boon/boon_state.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import {
  isBoonAvailable, pickBoon, grantBoonBypassingCap, removeActiveBoon, generateBoonOffer,
} from './boon.js';
import { applyBoonEffect, reverseBoonEffect } from './boon_effects.js';
import { calculateScoreTarget } from './progression.js';
import { grantCurse } from './curse.js';
import { PLACEMENT_ONLY_KINDS } from './boon_shop.js';
import { countGemClears, calculateGemAttributedScore } from './score.js';

/** Marks an event id as having fired — shared by all 3 event types, regardless of outcome. */
function markEventSeen(id) {
  if (!eventState.seenEventIds.includes(id)) {
    eventState.seenEventIds.push(id);
  }
}

/** Resolves a value that might be a plain value OR a function taking `...args` — used for text fields that need to reflect a specific outcome (e.g. which boons were granted/lost). */
function resolveMaybeFn(value, ...args) {
  return typeof value === 'function' ? value(...args) : value;
}

/** Every BOON_POOL entry of a given rarity safe to hand out as a random event reward. */
function candidatePoolForRarity(rarity, bypassCap) {
  return BOON_POOL.filter(def => {
    if (def.rarity !== rarity) return false;
    if (PLACEMENT_ONLY_KINDS.has(def.effect?.kind)) return false;
    if (def.effect?.gem && !gemUnlockState.unlocked[def.effect.gem]) return false;
    if (!bypassCap && !isBoonAvailable(def)) return false;
    return true;
  });
}

// ============================================================
// TRIGGER ROLL
// ============================================================

function findReplacementBoon(givenDef) {
  const candidates = BOON_POOL.filter(d =>
    d.rarity === givenDef.rarity &&
    d.id !== givenDef.id &&
    !PLACEMENT_ONLY_KINDS.has(d.effect?.kind) &&
    isBoonAvailable(d)
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Whether the player currently holds at least one boon with a valid same-rarity replacement — the Gem Mole's own eligibility rule. */
function hasValidEncounterCandidate() {
  return boonState.activeBoons.some(activeBoon => {
    const def = BOON_POOL.find(b => b.id === activeBoon.id);
    return def && findReplacementBoon(def) !== null;
  });
}

function hasValidChallengeReward() {
  return candidatePoolForRarity(BOON_RARITY.LEGENDARY, false).length > 0;
}

/**
 * Per-kind eligibility for one ENCOUNTER_POOL entry. Every kind
 * ALSO requires the def to be unseen — checked first, so an
 * already-fired Encounter can never re-qualify no matter what its
 * kind-specific rule says.
 *
 * @param {object} def - an ENCOUNTER_POOL entry.
 * @param {number} currentScore - live score, needed by 'gamble'
 *   (Fortune's Folly only appears above 0 score — see design).
 * @returns {boolean}
 */
function isEncounterEligible(def, currentScore) {
  if (eventState.seenEventIds.includes(def.id)) return false;

  if (def.kind === 'trade') return hasValidEncounterCandidate();
  if (def.kind === 'gamble') return currentScore > 0;
  if (def.kind === 'help_or_absorb') return true;
  return true;
}

function hasEligibleEncounter(currentScore) {
  return ENCOUNTER_POOL.some(def => isEncounterEligible(def, currentScore));
}

function hasEligibleElite() {
  return ELITE_POOL.some(def => !eventState.seenEventIds.includes(def.id));
}

function hasEligibleChallenge() {
  return CHALLENGE_POOL.some(def => !eventState.seenEventIds.includes(def.id)) && hasValidChallengeReward();
}

/**
 * Rolls whether an event fires this level-up, and if so, which type.
 *
 * @param {number} currentScore
 * @returns {string|null}
 */
export function tryTriggerEvent(currentScore) {
  const chance = EVENT_CHANCE_LADDER[eventState.chanceIndex];
  const roll = Math.random();

  const eligible = [];
  if (hasEligibleElite()) eligible.push({ type: EVENT_TYPE.ELITE, weight: EVENT_TYPE_WEIGHTS[EVENT_TYPE.ELITE] });
  if (hasEligibleEncounter(currentScore)) eligible.push({ type: EVENT_TYPE.ENCOUNTER, weight: EVENT_TYPE_WEIGHTS[EVENT_TYPE.ENCOUNTER] });
  if (hasEligibleChallenge()) eligible.push({ type: EVENT_TYPE.CHALLENGE, weight: EVENT_TYPE_WEIGHTS[EVENT_TYPE.CHALLENGE] });

  if (roll >= chance || eligible.length === 0) {
    eventState.chanceIndex = Math.min(eventState.chanceIndex + 1, EVENT_CHANCE_LADDER.length - 1);
    return null;
  }

  eventState.chanceIndex = 0;

  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll2 = Math.random() * totalWeight;
  for (const entry of eligible) {
    roll2 -= entry.weight;
    if (roll2 < 0) return entry.type;
  }
  return eligible[eligible.length - 1].type;
}

// ============================================================
// ENCOUNTER (UNCHANGED this round)
// ============================================================

/**
 * Picks one eligible, unseen ENCOUNTER_POOL entry and marks it seen
 * immediately, then builds whatever extra data THAT kind's dialog
 * needs. 'gamble' and 'help_or_absorb' need nothing extra up front —
 * their whole flow is driven interactively by main.js calling the
 * resolver functions below as the player makes choices.
 *
 * @param {number} currentScore
 * @returns {{kind:string, def:object, ...} | null}
 */
export function buildEncounterOffer(currentScore) {
  const eligibleDefs = ENCOUNTER_POOL.filter(def => isEncounterEligible(def, currentScore));
  if (eligibleDefs.length === 0) return null;

  const def = eligibleDefs[Math.floor(Math.random() * eligibleDefs.length)];
  markEventSeen(def.id);

  if (def.kind === 'trade') {
    // Re-find a specific held boon that has a valid replacement (same
    // logic hasValidEncounterCandidate() used to confirm eligibility,
    // now actually picking one).
    const eligibleHeldBoons = boonState.activeBoons.filter(activeBoon => {
      const heldDef = BOON_POOL.find(b => b.id === activeBoon.id);
      return heldDef && findReplacementBoon(heldDef) !== null;
    });
    const tradeAwayBoon = eligibleHeldBoons[Math.floor(Math.random() * eligibleHeldBoons.length)];
    const tradeAwayDef = BOON_POOL.find(b => b.id === tradeAwayBoon.id);
    const replacementDef = findReplacementBoon(tradeAwayDef);
    return { kind: 'trade', def, tradeAwayBoon, tradeAwayDef, replacementDef };
  }

  // 'gamble' and 'help_or_absorb' — nothing more to precompute; the
  // dialog drives everything from here via the resolver functions
  // further down this file.
  return { kind: def.kind, def };
}

export function resolveEncounterAccept(tradeAwayBoon, replacementDef) {
  const tradeAwayDef = BOON_POOL.find(b => b.id === tradeAwayBoon.id);
  reverseBoonEffect(tradeAwayBoon);
  removeActiveBoon(tradeAwayBoon.pickId);
  const newActiveBoon = pickBoon(replacementDef.id);
  newActiveBoon.appliedEffect = applyBoonEffect(replacementDef);
  return { givenName: tradeAwayDef.name, receivedName: replacementDef.name };
}

export function resolveEncounterDecline() {
  // Intentionally empty.
}

// ============================================================
// FORTUNE'S FOLLY (UNCHANGED this round)
// ============================================================

/**
 * Resolves the INITIAL bet: rolls a fresh 50/50, returns the bet
 * amount (already rounded) and whether it won. `scoreDelta` is always
 * `-potAmount` here — the wager leaves score the instant it's placed,
 * regardless of what happens next (see design: only the ORIGINAL bet
 * is ever actually deducted from score across the whole event, even
 * across a long double-or-nothing streak that eventually loses).
 *
 * @param {number} betPercent - one of FORTUNES_FOLLY.betOptions' percent values.
 * @param {number} currentScore
 * @returns {{ potAmount: number, won: boolean, scoreDelta: number }}
 */
export function placeFortunesFollyBet(betPercent, currentScore) {
  const potAmount = Math.round(currentScore * betPercent);
  const won = Math.random() < 0.5;
  return { potAmount, won, scoreDelta: -potAmount };
}

/**
 * Resolves one Double-or-Nothing flip against the CURRENT pot. A win
 * doubles the pot (still not credited to score); a loss zeroes it out
 * — but since the pot was never IN score to begin with, this returns
 * no further scoreDelta at all. main.js just discards the pot and
 * ends the event on a loss here.
 *
 * @param {number} currentPot
 * @returns {{ won: boolean, newPot: number }}
 */
export function flipFortunesFollyDoubleOrNothing(currentPot) {
  const won = Math.random() < 0.5;
  return { won, newPot: won ? currentPot * 2 : 0 };
}

/**
 * "Pay 5% and leave" — the one path that never gambles at all.
 *
 * @param {number} currentScore
 * @param {number} percent - FORTUNES_FOLLY.payAndLeave.percent (0.05).
 * @returns {{ amount: number, scoreDelta: number }}
 */
export function payFortunesFollyAndLeave(currentScore, percent) {
  const amount = Math.round(currentScore * percent);
  return { amount, scoreDelta: -amount };
}

// ============================================================
// LOST MINER (UNCHANGED this round)
// ============================================================

/**
 * "Help": a flat +15%-of-score reward, nothing else (no boon — an
 * earlier design draft included one, corrected to score-only).
 *
 * @param {number} currentScore
 * @param {object} def - the lost_miner ENCOUNTER_POOL entry.
 * @returns {{ scoreDelta: number }}
 */
export function resolveLostMinerHelp(currentScore, def) {
  const amount = Math.round(currentScore * def.helpScorePercent);
  return { scoreDelta: amount };
}

/**
 * "Absorb": grants exactly one normally-capped boon (rarity-weighted,
 * same pool a level-up offer draws from — NOT exempt from
 * maxOccurrences, unlike Elite's win reward) AND applies the one
 * curse in CURSE_POOL ("Weight of Greed" — +10% target score,
 * effective starting next level).
 *
 * @returns {{ grantedBoonName: string|null, curseName: string }} -
 *   grantedBoonName is null only in the edge case where literally no
 *   boon is available to grant at all (every eligible boon already
 *   maxed out) — main.js should fall back to a generic "nothing of
 *   value" phrase in that case.
 */
export function resolveLostMinerAbsorb() {
  const offer = generateBoonOffer(1);
  let grantedBoonName = null;
  if (offer.length > 0) {
    const rewardDef = offer[0];
    const activeBoon = pickBoon(rewardDef.id);
    if (activeBoon) {
      activeBoon.appliedEffect = applyBoonEffect(rewardDef);
      grantedBoonName = rewardDef.name;
    }
  }

  // Apply the curse regardless of whether a boon was actually
  // available — the miner's curse lands either way per the flavor
  // text ("the miner's curse has taken hold" is not conditioned on
  // there being a boon to steal).
  const curseDef = CURSE_POOL[0];
  const activeCurse = grantCurse(curseDef.id);
  activeCurse.appliedEffect = applyBoonEffect(curseDef);

  return { grantedBoonName, curseName: curseDef.name };
}

// ============================================================
// ELITE — generalized engine (REWRITTEN this round)
// ============================================================

/** Every unlocked active gem id — the pool gem_cap/gem_subscore_race pick their target from ("a random unlocked gem type"). */
function pickRandomUnlockedGemId() {
  const candidates = GEM_DEFINITIONS.map(g => g.id).filter(id => gemUnlockState.unlocked[id]);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function gemNameForId(gemId) {
  return GEM_DEFINITIONS.find(g => g.id === gemId)?.name || gemId;
}

/** Picks one eligible, unseen Elite def and marks it seen immediately, or null if none remain. */
export function pickEliteDef() {
  const eligible = ELITE_POOL.filter(def => !eventState.seenEventIds.includes(def.id));
  if (eligible.length === 0) return null;
  const def = eligible[Math.floor(Math.random() * eligible.length)];
  markEventSeen(def.id);
  return def;
}

/**
 * Begins an Elite fight. Fully sets up whichever win-condition this
 * def uses:
 *   - time_race: doubles THIS level's target directly (auto-reverts
 *     once advanceLevel() recomputes a fresh target next level — no
 *     explicit "undo" needed) and starts the clock.
 *   - gem_cap / gem_subscore_race: rolls a random unlocked gem to
 *     track and resets its counters. gem_subscore_race additionally
 *     computes its threshold from THIS level's target and the score
 *     the player had the moment the fight began.
 *
 * @param {object} def - an ELITE_POOL entry.
 * @param {number} currentScore - score at the moment the fight is
 *   accepted (only used by gem_subscore_race's threshold calc).
 * @returns {void}
 */
export function startEliteFight(def, currentScore) {
  activeEventState.type = EVENT_TYPE.ELITE;
  activeEventState.eliteDefId = def.id;
  activeEventState.eliteForLevel = progressionState.level;

  // Reset every win-condition-specific field up front so a def
  // switching kind between runs never inherits stale state.
  activeEventState.eliteStartedAt = null;
  activeEventState.eliteDurationMs = null;
  activeEventState.eliteGemId = null;
  activeEventState.eliteGemClearCount = 0;
  activeEventState.eliteCapBreached = false;
  activeEventState.eliteGemSubscore = 0;
  activeEventState.eliteSubscoreThreshold = 0;

  const wc = def.winCondition;
  if (wc.kind === 'time_race') {
    progressionState.scoreTarget = Math.round(progressionState.scoreTarget * wc.targetMultiplier);
    activeEventState.eliteStartedAt = Date.now();
    activeEventState.eliteDurationMs = wc.timeLimitMs;
  } else if (wc.kind === 'gem_cap') {
    activeEventState.eliteGemId = pickRandomUnlockedGemId();
  } else if (wc.kind === 'gem_subscore_race') {
    activeEventState.eliteGemId = pickRandomUnlockedGemId();
    const levelTarget = progressionState.scoreTarget;
    activeEventState.eliteSubscoreThreshold = Math.max(0, Math.floor(wc.thresholdPercent * (levelTarget - currentScore)));
  }
}

function clearEliteState() {
  activeEventState.type = null;
  activeEventState.eliteDefId = null;
  activeEventState.eliteForLevel = null;
  activeEventState.eliteStartedAt = null;
  activeEventState.eliteDurationMs = null;
  activeEventState.eliteGemId = null;
  activeEventState.eliteGemClearCount = 0;
  activeEventState.eliteCapBreached = false;
  activeEventState.eliteGemSubscore = 0;
  activeEventState.eliteSubscoreThreshold = 0;
}

/**
 * Applies one onWin/onLose/decline-penalty effect descriptor. Single
 * dispatcher for the Elite outcome-effect tagged union, mirroring
 * boon_effects.js's applyBoonEffect() pattern. Returns whatever
 * changed so the caller (resolveEliteOutcome()/declineElite()) can
 * both apply it to `score` (via the returned scoreDelta — this file
 * has no access to main.js's score variable) and interpolate it into
 * result text (grantedNames/removedNames).
 *
 * @param {object} effectSpec - an onWin/onLose/decline.penalty value.
 * @param {number} currentScore
 * @returns {{ scoreDelta: number, grantedNames: string[], removedNames: string[] }}
 */
function applyEliteOutcomeEffect(effectSpec, currentScore) {
  switch (effectSpec.kind) {
    case 'grant_boons': {
      const pool = candidatePoolForRarity(effectSpec.rarity, effectSpec.bypassCap);
      const grantedNames = [];
      for (let i = 0; i < effectSpec.count && pool.length > 0; i++) {
        const rewardDef = pool[Math.floor(Math.random() * pool.length)];
        const activeBoon = effectSpec.bypassCap ? grantBoonBypassingCap(rewardDef.id) : pickBoon(rewardDef.id);
        if (activeBoon) {
          activeBoon.appliedEffect = applyBoonEffect(rewardDef);
          grantedNames.push(rewardDef.name);
        }
      }
      return { scoreDelta: 0, grantedNames, removedNames: [] };
    }

    case 'lose_random_boons': {
      const removedNames = [];
      for (let i = 0; i < effectSpec.count; i++) {
        if (boonState.activeBoons.length === 0) break;
        const victim = boonState.activeBoons[Math.floor(Math.random() * boonState.activeBoons.length)];
        const victimDef = BOON_POOL.find(b => b.id === victim.id);
        if (victimDef) removedNames.push(victimDef.name);
        reverseBoonEffect(victim);
        removeActiveBoon(victim.pickId);
      }
      return { scoreDelta: 0, grantedNames: [], removedNames };
    }

    case 'target_percent': {
      // PERMANENT — stacks into the same multiplicative
      // targetScoreMultiplier the global-score boons use, so it
      // affects every future level's target, not just this one.
      boonEffectState.targetScoreMultiplier *= (1 + effectSpec.percent);
      progressionState.scoreTarget = calculateScoreTarget(progressionState.level);
      return { scoreDelta: 0, grantedNames: [], removedNames: [] };
    }

    case 'score_percent': {
      // One-time swing against currentScore — NOT stored anywhere;
      // the caller applies this delta to the live score variable.
      const amount = Math.round(currentScore * effectSpec.percent);
      return { scoreDelta: amount, grantedNames: [], removedNames: [] };
    }

    default:
      return { scoreDelta: 0, grantedNames: [], removedNames: [] };
  }
}

/**
 * Declining an Elite fight. Dispatches on `def.decline.kind`:
 *   - 'free': no consequence at all.
 *   - 'fixed_penalty': always applies `decline.penalty`.
 *   - 'coinflip_penalty': 50/50 — success is free, failure applies
 *     `decline.penalty` (Gem Cultivator's "Slip away").
 *
 * @param {object} def
 * @param {number} currentScore
 * @returns {{ penaltyApplied: boolean, scoreDelta: number, resultText: string, coinFlipResult: 'success'|'failure'|null }}
 */
export function declineElite(def, currentScore) {
  const decline = def.decline;

  if (decline.kind === 'free') {
    return { penaltyApplied: false, scoreDelta: 0, resultText: def.declineText, coinFlipResult: null };
  }

  if (decline.kind === 'fixed_penalty') {
    const { scoreDelta, removedNames } = applyEliteOutcomeEffect(decline.penalty, currentScore);
    const resultText = resolveMaybeFn(def.declineText, removedNames);
    return { penaltyApplied: true, scoreDelta, resultText, coinFlipResult: null };
  }

  if (decline.kind === 'coinflip_penalty') {
    const success = Math.random() < 0.5;
    if (success) {
      return { penaltyApplied: false, scoreDelta: 0, resultText: decline.successText, coinFlipResult: 'success' };
    }
    const { scoreDelta } = applyEliteOutcomeEffect(decline.penalty, currentScore);
    return { penaltyApplied: true, scoreDelta, resultText: decline.failureText, coinFlipResult: 'failure' };
  }

  return { penaltyApplied: false, scoreDelta: 0, resultText: '', coinFlipResult: null };
}

/**
 * NEW — call this after EVERY cascade step (normal match resolution
 * AND every swap-activated combo) while an Elite fight is active, so
 * gem_cap/gem_subscore_race tracking stays live. No-ops instantly if
 * no Elite is active or the active Elite doesn't use a gem-tracking
 * win-condition — safe to call unconditionally from main.js.
 *
 * @param {{gemType:number,length:number}[]} matchedGroups
 * @param {{gemType:number,row:number,col:number}[]} incidentalCells
 * @param {number} comboCount
 * @returns {void}
 */
export function recordEliteGemActivity(matchedGroups, incidentalCells, comboCount) {
  if (activeEventState.type !== EVENT_TYPE.ELITE) return;
  const def = ELITE_POOL.find(d => d.id === activeEventState.eliteDefId);
  if (!def) return;

  if (def.winCondition.kind === 'gem_cap') {
    const cleared = countGemClears(activeEventState.eliteGemId, matchedGroups, incidentalCells);
    if (cleared > 0) {
      activeEventState.eliteGemClearCount += cleared;
      if (activeEventState.eliteGemClearCount > def.winCondition.gemCap) {
        activeEventState.eliteCapBreached = true;
      }
    }
  } else if (def.winCondition.kind === 'gem_subscore_race') {
    const attributed = calculateGemAttributedScore(activeEventState.eliteGemId, matchedGroups, incidentalCells, comboCount);
    if (attributed !== 0) {
      activeEventState.eliteGemSubscore += attributed;
    }
  }
}

/**
 * NEW — plain-data snapshot of the active Elite's progress, for
 * main.js's objective banner. Returns null if no Elite is active.
 *
 * @returns {object|null}
 */
export function getEliteProgressInfo() {
  if (activeEventState.type !== EVENT_TYPE.ELITE) return null;
  const def = ELITE_POOL.find(d => d.id === activeEventState.eliteDefId);
  if (!def) return null;

  const kind = def.winCondition.kind;
  if (kind === 'time_race') {
    return { kind, name: def.name };
  }
  if (kind === 'gem_cap') {
    return {
      kind, name: def.name,
      gemName: gemNameForId(activeEventState.eliteGemId),
      count: activeEventState.eliteGemClearCount,
      cap: def.winCondition.gemCap,
      breached: activeEventState.eliteCapBreached,
    };
  }
  if (kind === 'gem_subscore_race') {
    return {
      kind, name: def.name,
      gemName: gemNameForId(activeEventState.eliteGemId),
      subscore: activeEventState.eliteGemSubscore,
      threshold: activeEventState.eliteSubscoreThreshold,
    };
  }
  return null;
}

/**
 * Called by main.js exactly when the level the Elite fight is
 * attached to is being cleared. Decides win/lose per the def's
 * winCondition.kind, applies the matching onWin/onLose effect, and
 * returns fully-resolved display text.
 *
 * @param {number} currentScore - LIVE score (already includes this
 *   gain) — Gem Cultivator's ±50% is computed off this.
 * @returns {{ won: boolean, resultText: string, scoreDelta: number } | null}
 */
export function resolveEliteOutcome(currentScore) {
  if (activeEventState.type !== EVENT_TYPE.ELITE) return null;

  const def = ELITE_POOL.find(d => d.id === activeEventState.eliteDefId);
  const wc = def.winCondition;

  let won;
  if (wc.kind === 'time_race') {
    const elapsedMs = Date.now() - activeEventState.eliteStartedAt;
    won = elapsedMs <= activeEventState.eliteDurationMs;
  } else if (wc.kind === 'gem_cap') {
    won = !activeEventState.eliteCapBreached;
  } else if (wc.kind === 'gem_subscore_race') {
    won = activeEventState.eliteGemSubscore >= activeEventState.eliteSubscoreThreshold;
  } else {
    won = false;
  }

  const effectSpec = won ? def.onWin : def.onLose;
  const { scoreDelta, grantedNames, removedNames } = applyEliteOutcomeEffect(effectSpec, currentScore);
  const resultText = won
    ? resolveMaybeFn(def.winText, grantedNames)
    : resolveMaybeFn(def.loseText, removedNames);

  clearEliteState();
  return { won, resultText, scoreDelta };
}

// ============================================================
// CHALLENGE (UNCHANGED this round)
// ============================================================

export function pickChallengeDef() {
  const eligible = CHALLENGE_POOL.filter(def => !eventState.seenEventIds.includes(def.id));
  if (eligible.length === 0) return null;
  const def = eligible[Math.floor(Math.random() * eligible.length)];
  markEventSeen(def.id);
  return def;
}

export function getActiveChallengeDef() {
  if (activeEventState.type !== EVENT_TYPE.CHALLENGE) return null;
  return CHALLENGE_POOL.find(d => d.id === activeEventState.challengeDefId) || null;
}

export function startChallenge(def) {
  activeEventState.type = EVENT_TYPE.CHALLENGE;
  activeEventState.challengeDefId = def.id;
  activeEventState.challengeForLevel = progressionState.level;
  activeEventState.challengeDetonated = false;
}

function clearChallengeState() {
  activeEventState.type = null;
  activeEventState.challengeDefId = null;
  activeEventState.challengeForLevel = null;
  activeEventState.challengeDetonated = false;
}

export function declineChallenge() {
  // Intentionally empty.
}

export function markChallengeDetonation() {
  if (activeEventState.type === EVENT_TYPE.CHALLENGE) {
    activeEventState.challengeDetonated = true;
  }
}

export function resolveChallengeOutcome() {
  if (activeEventState.type !== EVENT_TYPE.CHALLENGE) return null;

  const def = CHALLENGE_POOL.find(d => d.id === activeEventState.challengeDefId);
  const detonated = activeEventState.challengeDetonated;

  let succeeded = false;
  let resultText = null;

  if (!detonated) {
    const pool = candidatePoolForRarity(def.rewardRarity, false);
    if (pool.length > 0) {
      for (let i = 0; i < def.rewardCount && pool.length > 0; i++) {
        const rewardDef = pool[Math.floor(Math.random() * pool.length)];
        const activeBoon = pickBoon(rewardDef.id);
        if (activeBoon) activeBoon.appliedEffect = applyBoonEffect(rewardDef);
      }
      succeeded = true;
      resultText = def.winText;
    }
  }

  clearChallengeState();
  return { succeeded, resultText };
}

// ============================================================
// RESET
// ============================================================

export function resetEvents() {
  eventState.chanceIndex = 0;
  eventState.seenEventIds.length = 0;
  clearEliteState();
  clearChallengeState();
}