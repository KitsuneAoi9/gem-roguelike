// ============================================================
// EVENT.JS (gameplay) — Encounter/Elite/Challenge trigger, offer
// building, and outcome resolution.
//
// NEW THIS ROUND:
//   - Once-per-run tracking: eventState.seenEventIds. Every trigger/
//     pick function now filters its pool through this before rolling,
//     and marks whichever specific def gets chosen as seen IMMEDIATELY
//     (before the player has even made a choice) — "seen" means
//     "was shown", not "was won".
//   - ENCOUNTER_POOL now holds 3 differently-shaped entries
//     (kind: 'trade' | 'gamble' | 'help_or_absorb'). buildEncounterOffer()
//     dispatches on `kind` to decide what extra data (if any) the
//     offer needs; main.js's showEncounterDialog() dispatches on the
//     SAME field to pick which dialog renderer to use.
//   - Fortune's Folly (gamble) and Lost Miner (help_or_absorb) each
//     get their own small set of pure resolver functions — pure in
//     the sense that they take the live score/pot as a PARAMETER and
//     return a delta/result rather than reaching into main.js's
//     module-scoped `score` variable directly (main.js doesn't expose
//     that, and shouldn't need to — same "gameplay computes, main.js
//     applies" split as every other feature in this codebase).
// ============================================================

import { BOON_POOL, BOON_RARITY } from '../resources/boon/boon.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { activeEventState, eventState } from '../resources/event/event_state.js';
import {
  EVENT_TYPE, EVENT_TYPE_WEIGHTS, EVENT_CHANCE_LADDER,
  ENCOUNTER_POOL, ELITE_POOL, CHALLENGE_POOL,
} from '../resources/event/event.js';
import { CURSE_POOL } from '../resources/curse/curse.js';
import { progressionState } from '../resources/progression/progression.js';
import { boonState } from '../resources/boon/boon_state.js';
import {
  isBoonAvailable, pickBoon, grantBoonBypassingCap, removeActiveBoon, generateBoonOffer,
} from './boon.js';
import { applyBoonEffect, reverseBoonEffect } from './boon_effects.js';
import { grantCurse } from './curse.js';
import { PLACEMENT_ONLY_KINDS } from './boon_shop.js';

/** Marks an event id as having fired — shared by all three event types, regardless of outcome. */
function markEventSeen(id) {
  if (!eventState.seenEventIds.includes(id)) {
    eventState.seenEventIds.push(id);
  }
}

/** Every BOON_POOL entry of a given rarity safe to hand out as a random event reward — see prior round's doc comment. */
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

/** A same-rarity, different-id, currently-available replacement for `givenDef`, or null. */
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
  if (def.kind === 'help_or_absorb') return true; // always valid — no prerequisite at all

  return true; // unknown kind — fail open rather than silently excluding it
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
 * Rolls whether an event fires at all this level-up, and if so, which
 * type — re-normalizing EVENT_TYPE_WEIGHTS over whichever types
 * currently have at least one unseen, eligible def.
 *
 * NEW — if the roll succeeds (an event "wants" to fire) but NO type
 * is currently eligible (every event this run has already fired at
 * least once — the natural end-state once all pools are exhausted),
 * this is treated exactly like "no event" for ramp purposes: the
 * chance ladder still advances rather than getting stuck resetting to
 * 5% over and over for a roll that can never actually produce
 * anything.
 *
 * @param {number} currentScore - live score, forwarded to the
 *   Encounter eligibility check (Fortune's Folly's score>0 rule).
 * @returns {string|null} an EVENT_TYPE value, or null.
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

  eventState.chanceIndex = 0; // an event fires — reset the ramp

  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll2 = Math.random() * totalWeight;
  for (const entry of eligible) {
    roll2 -= entry.weight;
    if (roll2 < 0) return entry.type;
  }
  return eligible[eligible.length - 1].type; // floating-point safety net
}

// ============================================================
// ENCOUNTER — dispatch + per-kind offer builders
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

/** Executes a Gem Mole trade: reverse+remove the outgoing boon, pick+apply the incoming one through the normal capped path. */
export function resolveEncounterAccept(tradeAwayBoon, replacementDef) {
  const tradeAwayDef = BOON_POOL.find(b => b.id === tradeAwayBoon.id);

  reverseBoonEffect(tradeAwayBoon);
  removeActiveBoon(tradeAwayBoon.pickId);

  const newActiveBoon = pickBoon(replacementDef.id);
  newActiveBoon.appliedEffect = applyBoonEffect(replacementDef);

  return { givenName: tradeAwayDef.name, receivedName: replacementDef.name };
}

/** Declining a Gem Mole trade is a pure no-op. */
export function resolveEncounterDecline() {
  // Intentionally empty — see prior round's doc comment.
}

// ============================================================
// FORTUNE'S FOLLY — pure resolver functions
//
// None of these touch `score` directly (this file has no access to
// main.js's module-scoped score variable, by design) — each takes
// whatever inputs it needs as parameters and returns either a
// scoreDelta for main.js to apply, or a pot/won pair for main.js to
// carry forward into the next dialog node.
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
  const won = Math.random() < 0.5; // plain 50/50, no scaling with pot size — per design
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
// LOST MINER — pure resolver functions
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
// ELITE (unchanged this round, aside from seen-tracking)
// ============================================================

/** Picks one eligible, unseen Elite def and marks it seen immediately, or null if none remain. */
export function pickEliteDef() {
  const eligible = ELITE_POOL.filter(def => !eventState.seenEventIds.includes(def.id));
  if (eligible.length === 0) return null;
  const def = eligible[Math.floor(Math.random() * eligible.length)];
  markEventSeen(def.id);
  return def;
}

export function getActiveEliteDef() {
  if (activeEventState.type !== EVENT_TYPE.ELITE) return null;
  return ELITE_POOL.find(d => d.id === activeEventState.eliteDefId) || null;
}

export function startEliteFight(def) {
  activeEventState.type = EVENT_TYPE.ELITE;
  activeEventState.eliteDefId = def.id;
  activeEventState.eliteForLevel = progressionState.level;
  activeEventState.eliteStartedAt = Date.now();
  activeEventState.eliteDurationMs = def.timeLimitMs;
}

function clearEliteState() {
  activeEventState.type = null;
  activeEventState.eliteDefId = null;
  activeEventState.eliteForLevel = null;
  activeEventState.eliteStartedAt = null;
  activeEventState.eliteDurationMs = null;
}

export function declineElite(def) {
  if (!def.declinePenalty) return { penaltyApplied: false };
  applyEventPenalty(def.declinePenalty);
  return { penaltyApplied: true };
}

export function resolveEliteOutcome() {
  if (activeEventState.type !== EVENT_TYPE.ELITE) return null;

  const def = ELITE_POOL.find(d => d.id === activeEventState.eliteDefId);
  const elapsedMs = Date.now() - activeEventState.eliteStartedAt;
  const won = elapsedMs <= activeEventState.eliteDurationMs;

  let resultText;
  if (won) {
    const pool = candidatePoolForRarity(def.winRewardRarity, true);
    for (let i = 0; i < def.winRewardCount && pool.length > 0; i++) {
      const rewardDef = pool[Math.floor(Math.random() * pool.length)];
      const activeBoon = grantBoonBypassingCap(rewardDef.id);
      activeBoon.appliedEffect = applyBoonEffect(rewardDef);
    }
    resultText = def.winText;
  } else {
    applyEventPenalty(def.losePenalty);
    resultText = def.loseText;
  }

  clearEliteState();
  return { won, resultText };
}

// ============================================================
// CHALLENGE (unchanged this round, aside from seen-tracking)
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
// SHARED PENALTIES
// ============================================================

function applyEventPenalty(penalty) {
  switch (penalty.kind) {
    case 'lose_random_boon': {
      if (boonState.activeBoons.length === 0) return;
      const victim = boonState.activeBoons[Math.floor(Math.random() * boonState.activeBoons.length)];
      reverseBoonEffect(victim);
      removeActiveBoon(victim.pickId);
      return;
    }
    default:
      return;
  }
}

/**
 * Resets every event-related run-scoped bucket for a fresh run.
 * NEW — also clears seenEventIds, so every event can fire again on a
 * new run (they're run-scoped, not permanent).
 *
 * @returns {void}
 */
export function resetEvents() {
  eventState.chanceIndex = 0;
  eventState.seenEventIds.length = 0; // NEW
  clearEliteState();
  clearChallengeState();
}