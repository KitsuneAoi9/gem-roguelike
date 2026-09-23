// ============================================================
// EVENT_STATE.JS — mutable, per-run FIELD VARIABLES for the event
// system (Encounter/Elite/Challenge).
// ============================================================

export const eventState = {
  chanceIndex: 0,
  seenEventIds: [], // shared across all 3 types — see gameplay/event.js's markEventSeen()
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

  // NEW — gem_cap / gem_subscore_race win-conditions: which gem this
  // fight is scoped to, rolled fresh at fight-start (Cultist's Ritual/
  // Gem Cultivator both target "a random unlocked gem type").
  eliteGemId: null,

  // NEW — gem_cap tracking: running count of that gem cleared this
  // level (matches + incidental), and whether it's ever exceeded the
  // cap. Per design, exceeding the cap does NOT end the fight early —
  // the player still has to clear the level; this flag is just
  // consulted once the level actually clears.
  eliteGemClearCount: 0,
  eliteCapBreached: false,

  // NEW — gem_subscore_race tracking: running score attributed to
  // that one gem this level, and the threshold it needs to reach
  // (computed once at fight-start from that level's target and the
  // score the player had when the fight began).
  eliteGemSubscore: 0,
  eliteSubscoreThreshold: 0,

  // --- Challenge fields (unchanged) ---
  challengeDefId: null,
  challengeForLevel: null,
  challengeDetonated: false,
};