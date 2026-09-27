// ============================================================
// EVENT_STATE.JS — mutable, per-run FIELD VARIABLES for the event
// system (Encounter/Elite/Challenge).
// ============================================================

export const eventState = {
  chanceIndex: 0,
  seenEventIds: [], // shared across all 3 types
};

// The ONE mid-level modifier currently in effect, if any.
export const activeEventState = {
  type: null, // 'elite' | 'challenge' | null

  // --- Elite fields ---
  eliteDefId: null,
  eliteForLevel: null,

  // time_race win-condition only:
  eliteStartedAt: null,
  eliteDurationMs: null,

  // gem_cap / gem_subscore_race win-conditions:
  eliteGemId: null,
  eliteGemClearCount: 0,
  eliteCapBreached: false,
  eliteGemSubscore: 0,
  eliteSubscoreThreshold: 0,

  // --- Challenge fields ---
  challengeDefId: null,
  challengeForLevel: null,
  challengeDetonated: false,
  challengeLevelsRemaining: 0,

  // Recurring score-decay tracking (A Test of Endurance). Zeroed/null
  // for any Challenge def that doesn't declare a `decayEffect`.
  challengeDecayPercent: 0,
  challengeDecayIntervalMs: 0,
  challengeLastDecayAt: null,

  // NEW — time-limit tracking (A Test of Endurance). Zeroed/null for
  // any Challenge def that doesn't declare a `timeLimitMs` (e.g.
  // Silent Vein). Resolved the SAME way Elite's time_race is —
  // checked only at the moment the level actually clears, not via a
  // live-firing timeout.
  challengeStartedAt: null,
  challengeTimeLimitMs: 0,
};