// ============================================================
// EVENT.JS (gameplay) — Encounter/Elite/Challenge trigger, offer
// building, and outcome resolution.
//
// CHANGED THIS ROUND — the Challenge section: resolveChallengeOutcome()
// is REPLACED by checkChallengeLevelClear(), which can now return
// null ("still in progress, say nothing yet — this challenge spans
// multiple levels and not all of them have cleared cleanly"). See its
// doc comment below for the full before/after.
//
// NEW THIS ROUND:
//   - applyChallengeDecayIfDue(currentScore) — A Test of Endurance's
//     recurring score decay. Checked at cascade-settle time (main.js),
//     NOT a live wall-clock timer.
//   - checkChallengeLevelClear() now ALSO checks a time limit
//     (`def.timeLimitMs`), resolved the exact same way Elite's
//     time_race already is: only evaluated at the moment the level
//     actually clears (score reaches target) — there is no
//     independent timeout that fires on its own while the player is
//     just slow; if they never clear the level at all, the challenge
//     simply never resolves through this path (identical precedent
//     to how Boon Hoarder's time_race already behaves).
//   - checkChallengeLevelClear() now supports `def.useEventOnlyRewardPool`:
//     the win reward is drawn from BOON_POOL entries flagged in
//     EVENT_ONLY_BOON_IDS instead of a rarity-based roll.
// ============================================================

import { BOON_POOL, BOON_RARITY, EVENT_ONLY_BOON_IDS, SHOP_ONLY_BOON_IDS } from '../resources/boon/boon.js';
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
  isBoonAvailable, isRarityAllowed, pickBoon, grantBoonBypassingCap, removeActiveBoon, generateBoonOffer,
} from './boon.js';
import { applyBoonEffect, reverseBoonEffect } from './boon_effects.js';
import { calculateScoreTarget } from './progression.js';
import { grantCurse, pickRandomGemIdForCurse } from './curse.js';
import { PLACEMENT_ONLY_KINDS } from './boon_shop.js';
import { countGemClears, calculateGemAttributedScore } from './score.js';

/** Marks an event id as having fired — shared by all 3 event types, regardless of outcome. */
function markEventSeen(id) {
  if (!eventState.seenEventIds.includes(id)) {
    eventState.seenEventIds.push(id);
  }
}

/** Resolves a value that might be a plain value OR a function taking `...args` — used for text fields that need to reflect a specific outcome. */
function resolveMaybeFn(value, ...args) {
  return typeof value === 'function' ? value(...args) : value;
}

/** Minimal HTML-attribute escaping for description text before it gets spliced into a data-tooltip="..." attribute below. */
function escapeHtmlAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds a small dashed-underline, tooltip-bearing, rarity-colored
 * <span> for a boon or curse name, meant to be spliced directly into
 * event flavor/result text wherever a SPECIFIC boon or curse is
 * named.
 *
 * @param {object} def - a BOON_POOL entry OR a CURSE_POOL entry.
 * @param {boolean} [isCurse=false]
 * @returns {string} an HTML string. The CALLER is responsible for
 *   rendering it via `.innerHTML`.
 */
export function formatNamedEffectSpan(def, isCurse = false) {
  const rarityClass = isCurse ? 'event-inline-name--curse' : `event-inline-name--${def.rarity}`;
  return `<span class="event-inline-name ${rarityClass}" data-tooltip="${escapeHtmlAttr(def.description)}">${def.name}</span>`;
}

/**
 * NEW — whether a boon is reserved for ONE specific source and must
 * therefore never be handed out as a generic random event reward:
 *   - EVENT_ONLY_BOON_IDS (Overcharge Essence): only the event that
 *     explicitly names it (Test of Endurance) may grant it.
 *   - SHOP_ONLY_BOON_IDS (Booner, VIP Membership Card): only the
 *     Customer Service "Limited Edition Boons Sale" may sell them.
 *   - perpetual_boon: a last-resort offer filler, never a "reward"
 *     (same exclusion boon.js's offer generators already apply).
 *
 * Mirrors boon.js's isExcludedFromNormalOffers(), which isn't
 * exported. It is duplicated here instead of exported from boon.js to
 * keep this change to a single file; if the two ever drift, exporting
 * that one and importing it here is the cleaner long-term fix.
 *
 * @param {object} def - a BOON_POOL entry.
 * @returns {boolean} true if this boon must be skipped.
 */
function isReservedBoon(def) {
  return def.id === 'perpetual_boon'
    || EVENT_ONLY_BOON_IDS.has(def.id)
    || SHOP_ONLY_BOON_IDS.has(def.id);
}

/**
 * Every BOON_POOL entry of a given rarity safe to hand out as a random
 * event reward (Boon Hoarder's win, Silent Vein's win, etc.).
 *
 * @param {string} rarity
 * @param {boolean} bypassCap
 * @param {number} gateLevel - the level that reward is FOR.
 * @returns {object[]}
 */
function candidatePoolForRarity(rarity, bypassCap, gateLevel) {
  return BOON_POOL.filter(def => {
    if (def.rarity !== rarity) return false;

    // NEW — reserved boons (event-only / shop-only / perpetual) can
    // never come out of a random reward roll. Checked early since it's
    // the cheapest and most decisive filter.
    if (isReservedBoon(def)) return false;

    if (PLACEMENT_ONLY_KINDS.has(def.effect?.kind)) return false;
    if (def.effect?.gem && !gemUnlockState.unlocked[def.effect.gem]) return false;
    // Rarity level-gate for event rewards.
    if (!isRarityAllowed(def, 'event', gateLevel)) return false;
    if (!bypassCap && !isBoonAvailable(def)) return false;
    return true;
  });
}

/**
 * Every BOON_POOL entry flagged as event-only (EVENT_ONLY_BOON_IDS)
 * that's currently available to grant. Used by checkChallengeLevelClear()
 * for a `def.useEventOnlyRewardPool` challenge, instead of the normal
 * rarity-based candidatePoolForRarity() above.
 *
 * @param {boolean} bypassCap
 * @returns {object[]}
 */
function candidatesFromEventOnlyPool(bypassCap) {
  return BOON_POOL.filter(def => {
    if (!EVENT_ONLY_BOON_IDS.has(def.id)) return false;
    if (!bypassCap && !isBoonAvailable(def)) return false;
    return true;
  });
}

// ============================================================
// TRIGGER ROLL
// ============================================================

/**
 * Finds a same-rarity replacement boon for the Gem Mole's trade.
 *
 * @param {object} givenDef - the BOON_POOL entry being traded away.
 * @returns {object|null}
 */
function findReplacementBoon(givenDef) {
  // An Encounter fires after the last queued reward, so the level
  // "being rewarded" is the one just cleared.
  const gateLevel = progressionState.level - 1;
  const candidates = BOON_POOL.filter(d =>
    d.rarity === givenDef.rarity &&
    d.id !== givenDef.id &&
    !isReservedBoon(d) && // NEW — the mole can no longer hand out Booner/VIP/Overcharge Essence
    !PLACEMENT_ONLY_KINDS.has(d.effect?.kind) &&
    isRarityAllowed(d, 'event', gateLevel) &&
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

/**
 * Whether this (rarity-rolled) challenge would have anything to give
 * when it's finally won. The reward is granted on the LAST level of
 * the challenge's window, so we check the gate against that level:
 * (level about to be played) + durationLevels - 1.
 */
function hasValidChallengeReward(def) {
  const rewardLevel = progressionState.level + (def.durationLevels || 1) - 1;
  return candidatePoolForRarity(def.rewardRarity, false, rewardLevel).length > 0;
}

/**
 * NEW — an Elite whose win reward is "grant boons" (Boon Hoarder) is
 * only worth offering if that reward pool isn't empty at the level
 * it'll be fought on. Without this, the new Epic level-lock would let
 * a player "win" Boon Hoarder on level 2 and receive nothing.
 * Elites with other reward kinds are always viable.
 */
function hasEligibleEliteReward(def) {
  if (def.onWin?.kind !== 'grant_boons') return true;
  // The fight happens on the level about to be played, and is won by
  // clearing that same level.
  return candidatePoolForRarity(def.onWin.rarity, def.onWin.bypassCap, progressionState.level).length > 0;
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
  // Never re-offer an event that already fired this run.
  if (eventState.seenEventIds.includes(def.id)) return false;
  if (def.kind === 'trade') return hasValidEncounterCandidate();
  if (def.kind === 'gamble') return currentScore > 0;
  if (def.kind === 'help_or_absorb') return true;
  // Steal can always fire: curses are always available and the boon
  // side is padded with Perpetual Boon if the pool is exhausted.
  if (def.kind === 'steal') return true;
  // The Mimic needs at least one held boon to bite.
  if (def.kind === 'chest') return boonState.activeBoons.length > 0;
  return true;
}

function hasEligibleEncounter(currentScore) {
  return ENCOUNTER_POOL.some(def => isEncounterEligible(def, currentScore));
}

function hasEligibleElite() {
  return ELITE_POOL.some(def => !eventState.seenEventIds.includes(def.id));
}

/**
 * A challenge whose reward comes from the event-only pool
 * (`useEventOnlyRewardPool`) is eligible even if that pool happens to
 * be exhausted right now — checkChallengeLevelClear() already
 * tolerates an empty pool (falls back to loseText/failText), so
 * there's no "would this even have anything to give" pre-check
 * needed for it, unlike Silent Vein's normal-rarity-pool requirement.
 */
function hasEligibleChallenge() {
  return CHALLENGE_POOL.some(def => {
    if (eventState.seenEventIds.includes(def.id)) return false;
    if (def.useEventOnlyRewardPool) return true;
    return hasValidChallengeReward(def);
  });
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
// ENCOUNTER
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
// FORTUNE'S FOLLY
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
// LOST MINER
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
 * @returns {{ grantedBoonDef: object|null, curseDef: object }} -
 *   grantedBoonDef is null only in the edge case where literally no
 *   boon is available to grant at all (every eligible boon already
 *   maxed out) — main.js should fall back to a generic "nothing of
 *   value" phrase in that case.
 */
export function resolveLostMinerAbsorb() {
  const offer = generateBoonOffer(1, progressionState.level - 1);

  let grantedBoonDef = null;
  if (offer.length > 0) {
    const rewardDef = offer[0];
    const activeBoon = pickBoon(rewardDef.id);
    if (activeBoon) {
      activeBoon.appliedEffect = applyBoonEffect(rewardDef);
      grantedBoonDef = rewardDef;
    }
  }

  // Apply the curse regardless of whether a boon was actually
  // available — the miner's curse lands either way per the flavor
  // text ("the miner's curse has taken hold" is not conditioned on
  // there being a boon to steal). Still CURSE_POOL[0] specifically —
  // "Weight of Greed" is kept first in the pool on purpose so this
  // index keeps meaning the same thing even now that a second curse
  // (Crystallized Parasite) exists in the pool too.
  const curseDef = CURSE_POOL[0];
  const activeCurse = grantCurse(curseDef.id);
  activeCurse.appliedEffect = applyBoonEffect(curseDef);

  return { grantedBoonDef, curseDef };
}

// ============================================================
// SHARED HELPERS — random curse / random boons for Encounters
// ============================================================

/**
 * Grants ONE random curse from CURSE_POOL (every curse in the pool is
 * eligible; duplicates are allowed since curses have no cap). Curses
 * with unique/limited occurrences live outside this pool by design.
 *
 * Decaying Birthstone and Petrified need per-pick data (which gem they
 * track/lock), supplied here at grant time exactly like grantCurse()
 * documents.
 *
 * @returns {object} the CURSE_POOL def that was granted.
 */
function grantRandomCurse() {
  // Uniform pick, with replacement across calls (duplicates OK).
  const curseDef = CURSE_POOL[Math.floor(Math.random() * CURSE_POOL.length)];

  // Build per-pick data only for the curses that need it.
  let data = {};
  if (curseDef.effect?.kind === 'lethal_gem_clear') {
    // Decaying Birthstone: track a random unlocked gem, from 0 clears.
    data = { trackedGemId: pickRandomGemIdForCurse(), clearCount: 0 };
  } else if (curseDef.effect?.kind === 'gem_multiplier_lock') {
    // Petrified: lock a random unlocked gem's multiplier at 0.
    data = { lockedGem: pickRandomGemIdForCurse() };
  }

  // Same two-step every curse/boon grant follows: record, then apply.
  const activeCurse = grantCurse(curseDef.id, data);
  activeCurse.appliedEffect = applyBoonEffect(curseDef);
  return curseDef;
}

/**
 * Grants `count` random boons using the SAME rules as Lost Miner's
 * absorb / the level-up reward: rarity-weighted, levelUp rarity gate,
 * normal maxOccurrences cap, reserved boons excluded, and padded with
 * Perpetual Boon if the pool runs dry (generateBoonOffer() does all of
 * that). Boons within one call are distinct, except Perpetual padding.
 *
 * @param {number} count
 * @returns {object[]} the BOON_POOL defs actually granted.
 */
function grantRandomBoons(count) {
  if (count <= 0) return [];

  // An Encounter fires after the last queued reward, so the level
  // "being rewarded" is the one just cleared.
  const offer = generateBoonOffer(count, progressionState.level - 1);

  const granted = [];
  for (const def of offer) {
    const activeBoon = pickBoon(def.id);
    if (!activeBoon) continue; // cap hit between offer and pick (very unlikely)
    activeBoon.appliedEffect = applyBoonEffect(def);
    granted.push(def);
  }
  return granted;
}

// ============================================================
// MEDITATING ELF (steal)
// ============================================================

/**
 * Resolves "Steal": for each of def.stealCount items, an independent
 * 50/50 roll decides boon vs curse. Boons are granted first (one
 * batched call, so they're distinct), then curses.
 *
 * @param {object} def - the meditating_elf ENCOUNTER_POOL entry.
 * @returns {{ stolenSpans: string[], gotCurse: boolean }} display
 *   spans for every stolen item, plus whether any was a curse.
 */
export function resolveMeditatingElfSteal(def) {
  // Roll each item independently: true = boon, false = curse.
  let boonRolls = 0;
  let curseRolls = 0;
  for (let i = 0; i < def.stealCount; i++) {
    if (Math.random() < def.boonChance) boonRolls++;
    else curseRolls++;
  }

  const stolenSpans = [];

  // Boons (batched so the two can't be the same boon).
  grantRandomBoons(boonRolls).forEach(boonDef => {
    stolenSpans.push(formatNamedEffectSpan(boonDef));
  });

  // Curses (independent draws, duplicates allowed).
  for (let i = 0; i < curseRolls; i++) {
    stolenSpans.push(formatNamedEffectSpan(grantRandomCurse(), true));
  }

  return { stolenSpans, gotCurse: curseRolls > 0 };
}

// ============================================================
// TO OPEN OR NOT TO OPEN (chest)
// ============================================================

/**
 * Resolves "To open": rolls treasure vs Mimic (25%/75%).
 *   - Treasure: grants 2 random boons, returns +15% score (never
 *     negative — clamped to 0 if score is negative).
 *   - Mimic: reverses + removes one random HELD boon, grants one
 *     random curse in its place, returns -15% score (based on the
 *     absolute value, so a negative score still goes DOWN).
 * Score itself is applied by main.js, like every other event.
 *
 * @param {number} currentScore
 * @param {object} def - the to_open_or_not_to_open entry.
 * @returns {{
 *   outcome: 'treasure'|'mimic',
 *   scoreDelta: number,
 *   boonSpans: string[],
 *   curseSpan: string|null,
 * }}
 */
export function resolveChestOpen(currentScore, def) {
  const isTreasure = Math.random() < def.treasureChance;

  if (isTreasure) {
    const boonSpans = grantRandomBoons(def.treasureBoonCount)
      .map(boonDef => formatNamedEffectSpan(boonDef));
    // Clamp so treasure is never a penalty on a negative score.
    const scoreDelta = Math.max(0, Math.round(currentScore * def.scorePercent));
    return { outcome: 'treasure', scoreDelta, boonSpans, curseSpan: null };
  }

  // --- Mimic ---
  // Pick a random held boon (eligibility guarantees at least one).
  const victim = boonState.activeBoons[Math.floor(Math.random() * boonState.activeBoons.length)];
  const victimDef = BOON_POOL.find(b => b.id === victim.id);
  const victimSpan = victimDef ? formatNamedEffectSpan(victimDef) : 'a boon';

  // Undo its effect FIRST, then remove it (same order as Gem Mole).
  reverseBoonEffect(victim);
  removeActiveBoon(victim.pickId);

  // Replace it with a random curse.
  const curseSpan = formatNamedEffectSpan(grantRandomCurse(), true);

  // abs() so a negative score is still reduced, never raised.
  const scoreDelta = -Math.round(Math.abs(currentScore) * def.scorePercent);

  return { outcome: 'mimic', scoreDelta, boonSpans: [victimSpan], curseSpan };
}

// ============================================================
// ELITE — generalized engine
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
  const eligible = ELITE_POOL.filter(def =>
    !eventState.seenEventIds.includes(def.id) && hasEligibleEliteReward(def)
  );
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
      // Gate level = the level being cleared right now (advanceLevel()
      // hasn't run yet when an Elite resolves).
      const pool = candidatePoolForRarity(effectSpec.rarity, effectSpec.bypassCap, progressionState.level);
      const grantedNames = [];
      for (let i = 0; i < effectSpec.count && pool.length > 0; i++) {
        const rewardDef = pool[Math.floor(Math.random() * pool.length)];
        const activeBoon = effectSpec.bypassCap ? grantBoonBypassingCap(rewardDef.id) : pickBoon(rewardDef.id);
        if (activeBoon) {
          activeBoon.appliedEffect = applyBoonEffect(rewardDef);
          grantedNames.push(formatNamedEffectSpan(rewardDef));
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
        if (victimDef) removedNames.push(formatNamedEffectSpan(victimDef));
        reverseBoonEffect(victim);
        removeActiveBoon(victim.pickId);
      }
      return { scoreDelta: 0, grantedNames: [], removedNames };
    }

    case 'target_percent': {
      boonEffectState.targetScoreMultiplier *= (1 + effectSpec.percent);
      progressionState.scoreTarget = calculateScoreTarget(progressionState.level);
      return { scoreDelta: 0, grantedNames: [], removedNames: [] };
    }

    case 'score_percent': {
      const amount = Math.round(currentScore * effectSpec.percent);
      return { scoreDelta: amount, grantedNames: [], removedNames: [] };
    }

    // NEW — grants a specific curse by id. Currently only used by
    // Gem Cultivator's onLose (implants the Crystallized Parasite instead of
    // directly docking score). Mirrors the exact two-step
    // grantCurse()/applyBoonEffect() pattern every other curse/boon
    // grant in the codebase already follows.
    //
    // scoreDelta is always 0 here — this outcome kind never touches
    // score directly. Whatever the granted curse actually DOES (a
    // recurring drain, a permanent target bump, whatever a future
    // curse might do) is entirely up to that curse's own effect shape
    // and whatever code later checks for it — see main.js's
    // applyScoreGain() for the Crystallized Parasite's per-level drain.
    case 'grant_curse': {
      const curseDef = CURSE_POOL.find(c => c.id === effectSpec.curseId);
      if (curseDef) {
        const activeCurse = grantCurse(curseDef.id);
        activeCurse.appliedEffect = applyBoonEffect(curseDef);
      }
      return { scoreDelta: 0, grantedNames: [], removedNames: [] };
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
 * Call this after EVERY cascade step (normal match resolution
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

  // NEW — hand the def's own name back too, so main.js can title the
  // new result dialog (item 2) without re-looking it up itself.
  // Grabbed BEFORE clearEliteState() below — that call only resets
  // activeEventState, `def` itself stays perfectly valid either way,
  // but reading it here keeps the return shape self-contained.
  const name = def.name;

  clearEliteState();
  return { won, resultText, scoreDelta, name };
}

// ============================================================
// CHALLENGE
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

/**
 * CHANGED THIS ROUND — also initializes the decay-tracking fields
 * (`def.decayEffect`) AND the new time-limit fields (`def.timeLimitMs`).
 * Both stay at their zeroed/null defaults for any def that doesn't
 * declare them (e.g. Silent Vein has neither).
 *
 * @param {object} def
 * @returns {void}
 */
export function startChallenge(def) {
  activeEventState.type = EVENT_TYPE.CHALLENGE;
  activeEventState.challengeDefId = def.id;
  activeEventState.challengeForLevel = progressionState.level;
  activeEventState.challengeDetonated = false;
  activeEventState.challengeLevelsRemaining = def.durationLevels || 1;

  if (def.decayEffect) {
    activeEventState.challengeDecayPercent = def.decayEffect.percent;
    activeEventState.challengeDecayIntervalMs = def.decayEffect.intervalMs;
    activeEventState.challengeLastDecayAt = Date.now();
  } else {
    activeEventState.challengeDecayPercent = 0;
    activeEventState.challengeDecayIntervalMs = 0;
    activeEventState.challengeLastDecayAt = null;
  }

  // NEW — time-limit tracking, same "started now, checked only at
  // level-clear time" convention as Elite's time_race.
  if (def.timeLimitMs) {
    activeEventState.challengeStartedAt = Date.now();
    activeEventState.challengeTimeLimitMs = def.timeLimitMs;
  } else {
    activeEventState.challengeStartedAt = null;
    activeEventState.challengeTimeLimitMs = 0;
  }
}

function clearChallengeState() {
  activeEventState.type = null;
  activeEventState.challengeDefId = null;
  activeEventState.challengeForLevel = null;
  activeEventState.challengeDetonated = false;
  activeEventState.challengeLevelsRemaining = 0;
  activeEventState.challengeDecayPercent = 0;
  activeEventState.challengeDecayIntervalMs = 0;
  activeEventState.challengeLastDecayAt = null;
  activeEventState.challengeStartedAt = null;
  activeEventState.challengeTimeLimitMs = 0;
}

export function declineChallenge() {
  // Intentionally empty — main.js decides whether to show declineText.
}

export function markChallengeDetonation() {
  if (activeEventState.type === EVENT_TYPE.CHALLENGE) {
    activeEventState.challengeDetonated = true;
  }
}

/**
 * A Test of Endurance's recurring score decay. Call this once every
 * time a cascade fully settles (main.js's resolveMatches()) — NOT a
 * live wall-clock timer; evaluated lazily, computing however many
 * whole `challengeDecayIntervalMs` periods have elapsed since the
 * last check (could be more than one) and applying that many
 * COMPOUNDING deductions, advancing `challengeLastDecayAt` by exact
 * interval steps each time so no partial elapsed time is ever
 * silently dropped between checks.
 *
 * Safe to call unconditionally every settle; returns 0 instantly if
 * not applicable.
 *
 * @param {number} currentScore
 * @returns {number} total amount to deduct from score (0 if none due).
 */
export function applyChallengeDecayIfDue(currentScore) {
  if (activeEventState.type !== EVENT_TYPE.CHALLENGE) return 0;
  if (!activeEventState.challengeDecayPercent || !activeEventState.challengeDecayIntervalMs) return 0;
  if (activeEventState.challengeLastDecayAt == null) return 0;

  const now = Date.now();
  let elapsed = now - activeEventState.challengeLastDecayAt;
  let workingScore = currentScore;
  let totalDeducted = 0;

  while (elapsed >= activeEventState.challengeDecayIntervalMs) {
    // CHANGED — use the ABSOLUTE value of the score. Before, a
    // negative score produced a negative "deduction", which main.js
    // ignored (and which would have RAISED the score if applied).
    // Now a tick is always a positive amount that gets subtracted,
    // so the score keeps sinking: -100 -> -105 -> -110.25 ...
    const tickAmount = Math.round(Math.abs(workingScore) * activeEventState.challengeDecayPercent);
    totalDeducted += tickAmount;
    workingScore -= tickAmount; // subtracting a positive number always moves the score DOWN

    elapsed -= activeEventState.challengeDecayIntervalMs;
    // Advance by exact interval steps so no partial time is dropped.
    activeEventState.challengeLastDecayAt += activeEventState.challengeDecayIntervalMs;
  }

  return totalDeducted;
}

/**
 * NEW — resolves the active Challenge as an immediate LOSS with no
 * reward, and clears its state. Used by main.js's showNoMovesDialog()
 * when a challenge flagged `failsOnDeadlock` (A Test of Endurance) is
 * active at the moment the stuck-board game-over actually fires — the
 * run ending IS this challenge's loss condition, per design; this
 * just makes sure its state doesn't linger into whatever happens next
 * (a "start over" already resets everything anyway via resetEvents(),
 * but this keeps the moment-of-loss bookkeeping correct regardless).
 *
 * @returns {void}
 */
export function forceFailChallenge() {
  clearChallengeState();
}

/**
 * Call this once per level actually cleared while a Challenge is
 * active. Decides whether the challenge resolves NOW or should keep
 * silently tracking into the next level.
 *
 * CHANGED THIS ROUND — a def with `timeLimitMs` (A Test of Endurance)
 * now ALSO checks elapsed time against that limit at this exact
 * moment, BEFORE granting any reward: if the level cleared too slow,
 * it resolves as a loss (via `def.loseText ?? def.failText`) even
 * though the level itself was technically cleared. This mirrors
 * Elite's time_race resolution timing exactly — see
 * resolveEliteOutcome() above — rather than introducing a separate,
 * independently-firing timeout mechanism.
 *
 * Also supports `def.useEventOnlyRewardPool` (see candidatesFromEventOnlyPool()).
 *
 * @returns {{ succeeded: boolean, resultText: string, name: string } | null}
 *   null means "still in progress, say nothing yet."
 */
export function checkChallengeLevelClear() {
  if (activeEventState.type !== EVENT_TYPE.CHALLENGE) return null;

  const def = CHALLENGE_POOL.find(d => d.id === activeEventState.challengeDefId);
  if (!def) { clearChallengeState(); return null; } // shouldn't happen, safety net

  if (activeEventState.challengeDetonated) {
    // Failed at some point during the window — resolve as a loss
    // right now, regardless of how many levels were left to go.
    const name = def.name;
    clearChallengeState();
    return { succeeded: false, resultText: def.failText ?? def.loseText, name };
  }

  activeEventState.challengeLevelsRemaining -= 1;
  if (activeEventState.challengeLevelsRemaining > 0) {
    return null;
  }

  // NEW — time-limit check, evaluated right here at level-clear time.
  if (activeEventState.challengeTimeLimitMs > 0) {
    const elapsedMs = Date.now() - activeEventState.challengeStartedAt;
    if (elapsedMs > activeEventState.challengeTimeLimitMs) {
      const name = def.name;
      clearChallengeState();
      return { succeeded: false, resultText: def.loseText ?? def.failText, name };
    }
  }

  let resultText = def.failText ?? def.loseText;
  // Called inside the level-clear loop, so progressionState.level is
  // the level being cleared. The event-only pool is deliberately
  // exempt from the rarity gate — it's a fixed, hand-designed reward.
  const pool = def.useEventOnlyRewardPool
    ? candidatesFromEventOnlyPool(false)
    : candidatePoolForRarity(def.rewardRarity, false, progressionState.level);

  if (pool.length > 0) {
    for (let i = 0; i < def.rewardCount && pool.length > 0; i++) {
      const rewardDef = pool[Math.floor(Math.random() * pool.length)];
      const activeBoon = pickBoon(rewardDef.id);
      if (activeBoon) activeBoon.appliedEffect = applyBoonEffect(rewardDef);
    }
    resultText = def.winText;
  }

  const name = def.name;
  clearChallengeState();
  return { succeeded: true, resultText, name };
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