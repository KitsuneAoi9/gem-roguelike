// ============================================================
// BOON_EFFECTS.JS — applies (and reverses) a picked boon's effect on
// game state.
//
// applyBoonEffect(def) RETURNS a normalized "appliedEffect" record
// describing exactly what it just did (which gem(s), which bucket,
// how much). The caller attaches that return value onto the
// activeBoon entry pickBoon()/grantBoonBypassingCap() just created
// (`activeBoon.appliedEffect = applyBoonEffect(def)`), so a LATER
// call to reverseBoonEffect(activeBoon) can undo EXACTLY what was
// applied — including the specific random gems a Frenzy/Brilliance/
// Addict/Forbidden pick happened to penalize, which can't be
// re-derived from `def` alone since that randomness is resolved fresh
// every pick.
//
// NEW THIS ROUND — three new effect.kind cases:
//   - 'match3_shard_chance'         (Entropy/Luminous/Explosive Shard)
//   - 'match_size_multiplier_bonus' (Threesome/Foursome/Fivesome Matchmaker)
//   - 'gem_forbidden_swap'          (the 11-entry "Forbidden <Gem>" set)
// Frantic Star / Warmonger / Adventure Junkie / Perpetual Boon do NOT
// need new cases here — see resources/boon/boon.js's file header for
// why each of those is either a presence-only marker (checked via
// isBoonActive(), nothing to apply/reverse) or a recurring/triggered
// effect handled entirely in main.js's applyScoreGain(), same pattern
// Crystallized Parasite already established.
// ============================================================

import { gemBaseState } from '../resources/base%20value/gem_base_state.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { ALL_GEM_IDS } from '../resources/constant/constants.js';
import { progressionState } from '../resources/progression/progression.js';
import { resetGemBaseState } from './gem_base.js';
import { calculateScoreTarget } from './progression.js';

// Module-level counter so every frenzyPicks entry carries a unique
// id, letting reverseBoonEffect() find and splice out EXACTLY the
// entry a specific Frenzy pick pushed, even if the player has picked
// several different Frenzy boons this run. Reset alongside everything
// else in resetBoonEffects().
let nextFrenzyPickId = 1;

/**
 * Resets every boon-driven state bucket for a fresh run.
 *
 * @returns {void}
 */
export function resetBoonEffects() {
  resetGemBaseState();
  boonEffectState.affinityBonus = {};
  boonEffectState.frenzyPicks = [];
  boonEffectState.globalScoreMultiplier = 1.0;
  boonEffectState.globalScoreBonus = 0;
  boonEffectState.targetScoreMultiplier = 1.0;
  // NEW — reset the two brand-new state buckets alongside everything else.
  boonEffectState.shardPicks = { entropy: 0, luminous: 0, explosive: 0 };
  boonEffectState.matchSizeBonus = { 3: 0, 4: 0, 5: 0 };
  nextFrenzyPickId = 1;
}

/**
 * Picks `count` DISTINCT random gem ids to penalize, excluding
 * `excludeId` (the boon's own target gem). Only draws from UNLOCKED
 * gems — see prior handoff for the reasoning (a penalty on a locked
 * gem would be invisible to the player and unfairly debuff it before
 * it's even unlocked).
 *
 * @param {string} excludeId
 * @param {number} count
 * @returns {string[]}
 */
function pickRandomOtherGems(excludeId, count) {
  const candidates = ALL_GEM_IDS.filter(id => id !== excludeId && gemUnlockState.unlocked[id]);
  const pool = candidates.slice();
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    picked.push(pool[randomIndex]);
    pool.splice(randomIndex, 1); // never pick the same gem twice for this one boon
  }
  return picked;
}

/**
 * Applies one picked boon's effect. Call right after pickBoon()/
 * grantBoonBypassingCap() succeeds.
 *
 * RETURNS a normalized "appliedEffect" record describing exactly what
 * was just mutated, so the caller can attach it to the activeBoon
 * entry for later exact reversal. The shape varies by `effect.kind`
 * (see each case), but every shape is self-contained —
 * reverseBoonEffect() never re-reads `def` or re-rolls anything, it
 * just undoes precisely what's recorded here.
 *
 * @param {object} def - a BOON_POOL entry (the one just picked).
 * @returns {object} the appliedEffect record.
 */
export function applyBoonEffect(def) {
  const effect = def.effect;

  switch (effect.kind) {
    case 'gem_score_delta':
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      return { kind: effect.kind, gem: effect.gem, scoreAmount: effect.amount };

    case 'gem_multiplier_delta':
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.amount;
      return { kind: effect.kind, gem: effect.gem, multiplierAmount: effect.amount };

    case 'gem_polish':
      // Polish is the one archetype that bumps BOTH buckets at once —
      // two independent += lines, since scoreBonus/multiplierBonus
      // are separate fields on gemBaseState.perGem.
      gemBaseState.perGem[effect.gem].scoreBonus += effect.scoreAmount;
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.multiplierAmount;
      return {
        kind: effect.kind,
        gem: effect.gem,
        scoreAmount: effect.scoreAmount,
        multiplierAmount: effect.multiplierAmount,
      };

    case 'gem_score_opulence': {
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      // Deterministic (every OTHER gem, no randomness) — still record
      // the exact id list touched, rather than making
      // reverseBoonEffect() re-derive Opulence's "everyone but me" rule
      // itself.
      const affectedIds = ALL_GEM_IDS.filter(id => id !== effect.gem);
      affectedIds.forEach(id => { gemBaseState.perGem[id].scoreBonus += effect.othersPenalty; });
      return {
        kind: effect.kind,
        gem: effect.gem,
        scoreAmount: effect.amount,
        penalizedGems: affectedIds,
        penaltyAmount: effect.othersPenalty,
      };
    }

    case 'gem_score_brilliance': {
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      const penalizedGems = pickRandomOtherGems(effect.gem, effect.penalizedCount);
      penalizedGems.forEach(id => { gemBaseState.perGem[id].scoreBonus += effect.othersPenalty; });
      return {
        kind: effect.kind,
        gem: effect.gem,
        scoreAmount: effect.amount,
        penalizedGems,
        penaltyAmount: effect.othersPenalty,
      };
    }

    case 'gem_multiplier_addict': {
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.amount;
      const penalizedGems = pickRandomOtherGems(effect.gem, effect.penalizedCount);
      penalizedGems.forEach(id => { gemBaseState.perGem[id].multiplierBonus += effect.othersPenalty; });
      return {
        kind: effect.kind,
        gem: effect.gem,
        multiplierAmount: effect.amount,
        penalizedGems,
        penaltyAmount: effect.othersPenalty,
      };
    }

    case 'affinity':
      boonEffectState.affinityBonus[effect.gem] = (boonEffectState.affinityBonus[effect.gem] || 0) + effect.amount;
      return { kind: effect.kind, gem: effect.gem, amount: effect.amount };

    case 'frenzy': {
      const penalizedGems = pickRandomOtherGems(effect.gem, effect.penalizedCount);
      // frenzyPickId ties this exact frenzyPicks[] entry back to the
      // appliedEffect record below, so reverseBoonEffect() can splice
      // out precisely THIS pick's entry later.
      const frenzyPickId = nextFrenzyPickId++;
      boonEffectState.frenzyPicks.push({
        frenzyPickId,
        gemId: effect.gem,
        bonus: effect.bonus,
        penalty: effect.penalty,
        penalizedGems,
      });
      return {
        kind: effect.kind,
        gem: effect.gem,
        frenzyPickId,
        bonus: effect.bonus,
        penalty: effect.penalty,
        penalizedGems,
      };
    }

    case 'all_gem_score_delta':
      ALL_GEM_IDS.forEach(id => { gemBaseState.perGem[id].scoreBonus += effect.amount; });
      return { kind: effect.kind, scoreAmount: effect.amount, affectedGems: ALL_GEM_IDS.slice() };

    case 'all_gem_multiplier_delta':
      ALL_GEM_IDS.forEach(id => { gemBaseState.perGem[id].multiplierBonus += effect.amount; });
      return { kind: effect.kind, multiplierAmount: effect.amount, affectedGems: ALL_GEM_IDS.slice() };

    case 'global_score_boost': {
      const multiplierDelta = effect.flatMultiplierDelta || 0;
      const bonusDelta = effect.flatBonusDelta || 0;
      boonEffectState.globalScoreMultiplier += multiplierDelta;
      boonEffectState.globalScoreBonus += bonusDelta;

      // targetScoreMultiplier stacks MULTIPLICATIVELY — record the
      // exact factor applied (1 + pct) so reversal can divide back
      // out by that same factor rather than guessing.
      const targetFactor = effect.targetPercentIncrease ? (1 + effect.targetPercentIncrease) : 1;
      if (targetFactor !== 1) {
        boonEffectState.targetScoreMultiplier *= targetFactor;
      }
      progressionState.scoreTarget = calculateScoreTarget(progressionState.level);

      return { kind: effect.kind, multiplierDelta, bonusDelta, targetFactor };
    }

    // ============================================================
    // NEW — Entropy/Luminous/Explosive Shard. Purely a counter bump;
    // the actual "roll the chance, maybe spawn something" logic lives
    // in gameplay/special_gem.js, reading boonEffectState.shardPicks
    // directly at match-3 resolution time. Nothing here needs to know
    // which specific shard type does what.
    // ============================================================
    case 'match3_shard_chance':
      boonEffectState.shardPicks[effect.shardType] += 1;
      return { kind: effect.kind, shardType: effect.shardType };

    // ============================================================
    // NEW — Threesome/Foursome/Fivesome Matchmaker. Additive bonus on
    // top of base_score.js's fixed per-size multiplier table.
    // ============================================================
    case 'match_size_multiplier_bonus':
      boonEffectState.matchSizeBonus[effect.size] += effect.amount;
      return { kind: effect.kind, size: effect.size, amount: effect.amount };

    // ============================================================
    // NEW — the "Forbidden <Gem>" set. Same overall shape as Polish
    // (both score AND multiplier bumped on one gem) combined with
    // Brilliance's "penalize exactly N random other gems" pattern,
    // just hitting BOTH buckets on the penalized gem(s) too instead of
    // just one.
    // ============================================================
    case 'gem_forbidden_swap': {
      gemBaseState.perGem[effect.gem].scoreBonus += effect.scoreAmount;
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.multiplierAmount;
      const penalizedGems = pickRandomOtherGems(effect.gem, effect.penalizedCount);
      penalizedGems.forEach(id => {
        gemBaseState.perGem[id].scoreBonus += effect.otherScorePenalty;
        gemBaseState.perGem[id].multiplierBonus += effect.otherMultiplierPenalty;
      });
      return {
        kind: effect.kind,
        gem: effect.gem,
        scoreAmount: effect.scoreAmount,
        multiplierAmount: effect.multiplierAmount,
        penalizedGems,
        otherScorePenalty: effect.otherScorePenalty,
        otherMultiplierPenalty: effect.otherMultiplierPenalty,
      };
    }

    case 'board_expand':
    case 'board_shrink':
    case 'board_expand_and_shrink':
      // Deliberate no-op — see prior handoffs. Nothing to reverse
      // either; flagged `reversible: false` so reverseBoonEffect()
      // explicitly refuses rather than silently doing nothing.
      return { kind: effect.kind, reversible: false };

    // NEW — every kind that falls through to here on purpose:
    //   - 'flag_no_op'              (Frantic Star — presence-only marker,
    //                                checked directly via isBoonActive())
    //   - 'perpetual_score_percent' (Perpetual Boon — recurring/triggered,
    //                                handled entirely in main.js's
    //                                applyScoreGain(), same non-static-
    //                                delta pattern Crystallized Parasite uses)
    //   - 'lethal_gem_clear'        (Decaying Birthstone curse — its real
    //                                per-pick data lives directly on the
    //                                activeCurse entry via grantCurse()'s
    //                                `data` param, not in gemBaseState/
    //                                boonEffectState at all)
    //   - 'gem_multiplier_lock'     (Petrified curse — same reasoning;
    //                                the lock is read directly off the
    //                                activeCurse entry by gem_base.js)
    // None of these have anything for THIS dispatcher to apply or
    // later reverse, so `reversible: false` is exactly correct.
    default:
      return { kind: effect.kind, reversible: false };
  }
}

/**
 * Undoes exactly what applyBoonEffect() did for one specific
 * activeBoon entry, using that entry's stored `appliedEffect` (NOT
 * re-reading `def` — a random effect's exact targets are only known
 * from what was actually applied). Call BEFORE removing the entry
 * from boonState.activeBoons (gameplay/boon.js's removeActiveBoon())
 * — this function only touches gemBaseState/boonEffectState/
 * progressionState, never the boon list itself.
 *
 * @param {object} activeBoon - an entry from boonState.activeBoons,
 *   with a non-null `appliedEffect`.
 * @returns {boolean} true if the reversal actually undid something;
 *   false if this pick's effect was flagged non-reversible.
 */
export function reverseBoonEffect(activeBoon) {
  const applied = activeBoon?.appliedEffect;
  if (!applied) return false;
  if (applied.reversible === false) return false;

  switch (applied.kind) {
    case 'gem_score_delta':
      gemBaseState.perGem[applied.gem].scoreBonus -= applied.scoreAmount;
      return true;

    case 'gem_multiplier_delta':
      gemBaseState.perGem[applied.gem].multiplierBonus -= applied.multiplierAmount;
      return true;

    case 'gem_polish':
      gemBaseState.perGem[applied.gem].scoreBonus -= applied.scoreAmount;
      gemBaseState.perGem[applied.gem].multiplierBonus -= applied.multiplierAmount;
      return true;

    // Opulence and Brilliance share the same appliedEffect shape
    // (scoreAmount + penalizedGems + penaltyAmount) — safe to combine.
    case 'gem_score_opulence':
    case 'gem_score_brilliance':
      gemBaseState.perGem[applied.gem].scoreBonus -= applied.scoreAmount;
      applied.penalizedGems.forEach(id => {
        gemBaseState.perGem[id].scoreBonus -= applied.penaltyAmount;
      });
      return true;

    case 'gem_multiplier_addict':
      gemBaseState.perGem[applied.gem].multiplierBonus -= applied.multiplierAmount;
      applied.penalizedGems.forEach(id => {
        gemBaseState.perGem[id].multiplierBonus -= applied.penaltyAmount;
      });
      return true;

    case 'affinity':
      boonEffectState.affinityBonus[applied.gem] = (boonEffectState.affinityBonus[applied.gem] || 0) - applied.amount;
      return true;

    case 'frenzy': {
      // Splice out ONLY the exact frenzyPicks entry this pick pushed
      // — matched by frenzyPickId, never by array position.
      const idx = boonEffectState.frenzyPicks.findIndex(p => p.frenzyPickId === applied.frenzyPickId);
      if (idx !== -1) boonEffectState.frenzyPicks.splice(idx, 1);
      return true;
    }

    case 'all_gem_score_delta':
      applied.affectedGems.forEach(id => { gemBaseState.perGem[id].scoreBonus -= applied.scoreAmount; });
      return true;

    case 'all_gem_multiplier_delta':
      applied.affectedGems.forEach(id => { gemBaseState.perGem[id].multiplierBonus -= applied.multiplierAmount; });
      return true;

    case 'global_score_boost':
      boonEffectState.globalScoreMultiplier -= applied.multiplierDelta;
      boonEffectState.globalScoreBonus -= applied.bonusDelta;
      if (applied.targetFactor !== 1) {
        boonEffectState.targetScoreMultiplier /= applied.targetFactor;
      }
      progressionState.scoreTarget = calculateScoreTarget(progressionState.level);
      return true;

    // NEW — reverse the two brand-new stat-bucket kinds.
    case 'match3_shard_chance':
      boonEffectState.shardPicks[applied.shardType] -= 1;
      return true;

    case 'match_size_multiplier_bonus':
      boonEffectState.matchSizeBonus[applied.size] -= applied.amount;
      return true;

    case 'gem_forbidden_swap':
      gemBaseState.perGem[applied.gem].scoreBonus -= applied.scoreAmount;
      gemBaseState.perGem[applied.gem].multiplierBonus -= applied.multiplierAmount;
      applied.penalizedGems.forEach(id => {
        gemBaseState.perGem[id].scoreBonus -= applied.otherScorePenalty;
        gemBaseState.perGem[id].multiplierBonus -= applied.otherMultiplierPenalty;
      });
      return true;

    default:
      return false;
  }
}