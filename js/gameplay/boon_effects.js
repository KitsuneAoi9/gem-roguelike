// ============================================================
// BOON_EFFECTS.JS — applies a picked boon's effect to game state.
//
// Separate from boon.js (offer generation + pick tracking) per Rule 5
// — this file's only job is "given a boon definition, mutate the
// right state." Dispatches on effect.kind (see resources/boon/boon.js).
//
// REWORKED THIS ROUND — three effect kinds (frenzy, gem_score_brilliance
// [NEW], gem_multiplier_addict) now pick TWO RANDOM OTHER gems to
// penalize, instead of hitting every other gem in the catalog. That
// randomness is resolved HERE, once, at apply time — never in
// resources/boon/boon.js (Rule 6: no functions/randomness in
// resources) and never re-rolled later. Two brand new kinds this
// round: 'gem_polish' (Polish — touches both score AND multiplier in
// one pick) and 'all_gem_score_delta'/'all_gem_multiplier_delta'
// (Jeweler/Gemologist — the new "non-series", not-gem-scoped boons).
// ============================================================

import { gemBaseState } from '../resources/base%20value/gem_base_state.js';
import { boonEffectState } from '../resources/boon/boon_effect_state.js';
import { ALL_GEM_IDS } from '../resources/constant/constants.js';
import { progressionState } from '../resources/progression/progression.js';
import { resetGemBaseState } from './gem_base.js';
import { calculateScoreTarget } from './progression.js';

/**
 * Resets every boon-driven state bucket for a fresh run. Call from
 * main.js's init(), BEFORE resetProgression() — the target-score
 * multiplier this resets needs to be back at 1.0 before level 1's
 * target is calculated.
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
}

/**
 * NEW — picks `count` DISTINCT random gem ids from the full 11-gem
 * catalog (ALL_GEM_IDS — active AND locked/future), excluding
 * `excludeId` (always the boon's own target gem, so a boon can never
 * accidentally penalize the same gem it's buffing).
 *
 * Used by every "penalize N random OTHER gems" effect this round —
 * Frenzy, Brilliance, Addict. Locked gems ARE eligible targets, same
 * precedent Lush already set (its own "penalize every other gem"
 * sweep never excluded locked gems either) — a penalty landing on a
 * gem before it's unlocked just means that gem starts its unlocked
 * life already slightly behind, same as Lush's existing behavior.
 *
 * Simple partial shuffle-by-removal from a scratch copy of the
 * candidate list, taking the first `count` — good enough at this
 * list's tiny size (at most 11 entries) and guarantees no gem is
 * ever picked twice for the same boon.
 *
 * @param {string} excludeId - the boon's own gem — never picked.
 * @param {number} count - how many distinct other gems to pick.
 * @returns {string[]} exactly `count` gem ids (the catalog always has
 *   far more than `count` non-excluded entries, so this never comes
 *   up short in practice).
 */
function pickRandomOtherGems(excludeId, count) {
  // Start from every gem EXCEPT the one this boon is targeting.
  const candidates = ALL_GEM_IDS.filter(id => id !== excludeId);
  const pool = candidates.slice();
  const picked = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    picked.push(pool[randomIndex]);
    // Remove the picked gem from the pool so it can never be chosen
    // a second time for THIS boon's penalty set.
    pool.splice(randomIndex, 1);
  }

  return picked;
}

/**
 * Applies one picked boon's effect. Call right after pickBoon()
 * succeeds.
 *
 * @param {object} def - a BOON_POOL entry (the one just picked).
 * @returns {void}
 */
export function applyBoonEffect(def) {
  const effect = def.effect;

  switch (effect.kind) {
    case 'gem_score_delta':
      // Simple, no-drawback base-score bump — used by Bounty and
      // Grandeur (they only differ in `amount`).
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      break;

    case 'gem_multiplier_delta':
      // Simple, no-drawback base-multiplier bump — used by
      // Enthusiast, Maniac, and Fanatic (differ only in `amount`).
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.amount;
      break;

    // NEW — Polish: the only archetype that bumps BOTH base score
    // AND base multiplier from a single pick, with no drawback at
    // all. Two independent += lines rather than one combined helper,
    // since scoreBonus and multiplierBonus are separate buckets on
    // gemBaseState.perGem.
    case 'gem_polish':
      gemBaseState.perGem[effect.gem].scoreBonus += effect.scoreAmount;
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.multiplierAmount;
      break;

    case 'gem_score_lush':
      // Lush: +amount to the picked gem, -othersPenalty to EVERY
      // OTHER gem in the catalog (including locked ones) — unchanged
      // from before. This is the "hits everyone" archetype; Brilliance
      // below is the "hits two random gems" one — kept as a separate
      // kind specifically so their very different blast radius can
      // never be confused at a call site.
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      ALL_GEM_IDS.forEach(id => {
        if (id !== effect.gem) gemBaseState.perGem[id].scoreBonus += effect.othersPenalty;
      });
      break;

    // NEW — Brilliance: +amount to the picked gem, -othersPenalty to
    // exactly `effect.penalizedCount` (2) RANDOM other gems, chosen
    // fresh right now via pickRandomOtherGems(). Unlike Lush, most of
    // the catalog is untouched — only the two unlucky gems randomly
    // drawn here ever see the penalty, and that draw happens once,
    // permanently, at pick time (same "baked into gemBaseState, never
    // re-rolled" spirit as every other base-value boon).
    case 'gem_score_brilliance': {
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      const penalizedGems = pickRandomOtherGems(effect.gem, effect.penalizedCount);
      penalizedGems.forEach(id => {
        gemBaseState.perGem[id].scoreBonus += effect.othersPenalty;
      });
      break;
    }

    case 'gem_multiplier_addict':
      // CHANGED THIS ROUND — Addict used to penalize EVERY other
      // gem's multiplier; now it only penalizes `effect.penalizedCount`
      // (2) RANDOM other gems, same one-time-random-draw pattern as
      // Brilliance just above.
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.amount;
      pickRandomOtherGems(effect.gem, effect.penalizedCount).forEach(id => {
        gemBaseState.perGem[id].multiplierBonus += effect.othersPenalty;
      });
      break;

    case 'affinity':
      boonEffectState.affinityBonus[effect.gem] = (boonEffectState.affinityBonus[effect.gem] || 0) + effect.amount;
      break;

    case 'frenzy': {
      // CHANGED THIS ROUND — the per-match penalty used to apply to
      // EVERY gem other than the picked one; now it only applies to
      // `effect.penalizedCount` (2) RANDOM other gems, drawn once
      // right here and stored on the pick itself (`penalizedGems`) so
      // score.js's frenzyAdjustmentFor() knows exactly which two
      // gems this specific Frenzy pick affects, for the rest of the
      // run. A gem that's neither the target NOR one of these two
      // random picks is completely untouched by this Frenzy pick.
      const penalizedGems = pickRandomOtherGems(effect.gem, effect.penalizedCount);
      boonEffectState.frenzyPicks.push({
        gemId: effect.gem,
        bonus: effect.bonus,
        penalty: effect.penalty,
        penalizedGems,
      });
      break;
    }

    // NEW — Jeweler: flat base-score bump applied to EVERY gem in the
    // catalog at once (active AND locked), no target gem, no
    // drawback. Distinct from Lush's "every OTHER gem" sweep — there
    // is no single favored gem here to exclude.
    case 'all_gem_score_delta':
      ALL_GEM_IDS.forEach(id => {
        gemBaseState.perGem[id].scoreBonus += effect.amount;
      });
      break;

    // NEW — Gemologist: same idea as Jeweler, but for base multiplier
    // instead of base score.
    case 'all_gem_multiplier_delta':
      ALL_GEM_IDS.forEach(id => {
        gemBaseState.perGem[id].multiplierBonus += effect.amount;
      });
      break;

    case 'global_score_boost':
      boonEffectState.globalScoreMultiplier += effect.flatMultiplierDelta || 0;
      boonEffectState.globalScoreBonus += effect.flatBonusDelta || 0;
      if (effect.targetPercentIncrease) {
        boonEffectState.targetScoreMultiplier *= (1 + effect.targetPercentIncrease);
      }
      // re-derive the CURRENT level's target now, using the new
      // multiplier — advanceLevel() already set the old target before
      // this boon was offered, so refresh it immediately on pick
      progressionState.scoreTarget = calculateScoreTarget(progressionState.level);
      break;

    case 'board_expand':
    case 'board_shrink':
    case 'board_expand_and_shrink':
      // Deliberate no-op here — see prior handoffs for the full
      // reasoning (a board-shape change needs a player click, so it
      // can't be applied synchronously here).
      break;

    default:
      // tile boons / other future types — nothing to apply yet
      break;
  }
}