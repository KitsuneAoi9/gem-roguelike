// ============================================================
// BOON_EFFECTS.JS — applies (and, new this round, REVERSES) a picked
// boon's effect on game state.
//
// applyBoonEffect(def) now RETURNS a normalized "appliedEffect"
// record describing exactly what it just did (which gem(s), which
// bucket, how much). The caller attaches that return value onto the
// activeBoon entry pickBoon()/grantBoonBypassingCap() just created
// (`activeBoon.appliedEffect = applyBoonEffect(def)`), so a LATER
// call to reverseBoonEffect(activeBoon) can undo EXACTLY what was
// applied — including the specific random gems a Frenzy/Brilliance/
// Addict pick happened to penalize, which can't be re-derived from
// `def` alone since that randomness is resolved fresh every pick.
//
// This is the foundation for the event system's "trade away a boon"
// (Encounter) and "lose a random boon" (Elite loss) — and, per
// design, a future level-up/level-down boon mechanic is expected to
// reuse this exact reversal path too.
// ============================================================

import { gemBaseState } from '../resources/base%20value/gem_base_state.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import { gemUnlockState } from '../resources/gem/gem_unlock_state.js';
import { ALL_GEM_IDS } from '../resources/constant/constants.js';
import { progressionState } from '../resources/progression/progression.js';
import { resetGemBaseState } from './gem_base.js';
import { calculateScoreTarget } from './progression.js';

// NEW — module-level counter so every frenzyPicks entry carries a
// unique id, letting reverseBoonEffect() find and splice out EXACTLY
// the entry a specific Frenzy pick pushed, even if the player has
// picked several different Frenzy boons this run. Reset alongside
// everything else in resetBoonEffects().
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
  nextFrenzyPickId = 1; // NEW
}

/**
 * Picks `count` DISTINCT random gem ids to penalize, excluding
 * `excludeId` (the boon's own target gem).
 *
 * CHANGED THIS ROUND — only draws from UNLOCKED gems now. Frenzy/
 * Brilliance/Addict's random penalty target was landing on locked
 * gems (Onyx etc.) — a penalty the player can't even see reflected
 * anywhere (the side panel only shows the 7 active gems), and one
 * that gives that gem's eventual unlock a nasty invisible head-start
 * debuff. This does NOT change Lush's or Jeweler/Gemologist's "every
 * gem in the catalog" sweep elsewhere in this file — those are
 * untouched, per existing precedent — only the RANDOM-pick
 * archetypes are affected, since only they route through this helper.
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

    case 'gem_score_lush': {
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      // Deterministic (every OTHER gem, no randomness) — still record
      // the exact id list touched, rather than making
      // reverseBoonEffect() re-derive Lush's "everyone but me" rule
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
      // NEW — frenzyPickId ties this exact frenzyPicks[] entry back
      // to the appliedEffect record below, so reverseBoonEffect() can
      // splice out precisely THIS pick's entry later.
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

    case 'board_expand':
    case 'board_shrink':
    case 'board_expand_and_shrink':
      // Deliberate no-op — see prior handoffs. Nothing to reverse
      // either; flagged `reversible: false` so reverseBoonEffect()
      // explicitly refuses rather than silently doing nothing.
      return { kind: effect.kind, reversible: false };

    default:
      return { kind: effect.kind, reversible: false };
  }
}

/**
 * NEW — undoes exactly what applyBoonEffect() did for one specific
 * activeBoon entry, using that entry's stored `appliedEffect` (NOT
 * re-reading `def` — a random effect's exact targets are only known
 * from what was actually applied). Call BEFORE removing the entry
 * from boonState.activeBoons (gameplay/boon.js's removeActiveBoon())
 * — this function only touches gemBaseState/boonEffectState/
 * progressionState, never the boon list itself.
 *
 * Foundation for the event system's "trade away a boon" (Encounter)
 * and "lose a random boon" (Elite loss). Per design, a future
 * level-DOWN boon mechanic is expected to reuse this exact function.
 *
 * @param {object} activeBoon - an entry from boonState.activeBoons,
 *   with a non-null `appliedEffect`.
 * @returns {boolean} true if the reversal actually undid something;
 *   false if this pick's effect was flagged non-reversible (currently
 *   only the board-shape kinds).
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

    // Lush and Brilliance share the same appliedEffect shape
    // (scoreAmount + penalizedGems + penaltyAmount) — safe to combine.
    case 'gem_score_lush':
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
      // — matched by frenzyPickId, never by array position (position
      // could have shifted if an earlier Frenzy pick was already
      // removed this run).
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

    default:
      return false;
  }
}