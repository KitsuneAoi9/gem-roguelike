// ============================================================
// BOON_EFFECTS.JS — applies a picked boon's effect to game state.
//
// Separate from boon.js (offer generation + pick tracking) per Rule 5
// — this file's only job is "given a boon definition, mutate the
// right state." Dispatches on effect.kind (see resources/boon/boon.js).
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
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      break;

    case 'gem_multiplier_delta':
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.amount;
      break;

    case 'gem_score_lush':
      gemBaseState.perGem[effect.gem].scoreBonus += effect.amount;
      // penalty hits every OTHER gem, including ones not unlocked yet
      ALL_GEM_IDS.forEach(id => {
        if (id !== effect.gem) gemBaseState.perGem[id].scoreBonus += effect.othersPenalty;
      });
      break;

    case 'gem_multiplier_addict':
      gemBaseState.perGem[effect.gem].multiplierBonus += effect.amount;
      ALL_GEM_IDS.forEach(id => {
        if (id !== effect.gem) gemBaseState.perGem[id].multiplierBonus += effect.othersPenalty;
      });
      break;

    case 'affinity':
      boonEffectState.affinityBonus[effect.gem] = (boonEffectState.affinityBonus[effect.gem] || 0) + effect.amount;
      break;

    case 'frenzy':
      boonEffectState.frenzyPicks.push({ gemId: effect.gem, bonus: effect.bonus, penalty: effect.penalty });
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
      // Deliberate no-op here — unlike every other boon kind, a
      // board-shape change can't be applied synchronously: it needs the
      // player to click a cell. applyBoonEffect() only ever mutates
      // passive state (gemBaseState/boonEffectState/progressionState);
      // the actual grid mutation happens later, via main.js's
      // startTilePlacement()/handlePlacementClick(), once the player has
      // picked where to place it. This is a documented exception to Rule
      // 11's "single dispatcher mutates state" — record it as such in
      // the handoff so nobody "fixes" this into a real case later.
      break;

    default:
      // tile boons / other future types — nothing to apply yet
      break;
  }
}