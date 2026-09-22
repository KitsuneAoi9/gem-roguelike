// ============================================================
// EVENT_STATE.JS — mutable, per-run FIELD VARIABLES for the event
// system (Encounter/Elite/Challenge).
// ============================================================

export const eventState = {
  // Index into EVENT_CHANCE_LADDER (resources/event/event.js) — how
  // many consecutive "no event" level-ups have happened in a row.
  chanceIndex: 0,

  // NEW — every event def's id (Encounter OR Elite OR Challenge —
  // one shared list, not tracked per-type) that has ever fired this
  // run, regardless of outcome (win/lose/accept/decline/flee all
  // count). Once an id is in here, it can never be offered again for
  // the rest of this run. Reset on "start over" — this is run-scoped,
  // NOT permanent meta-progression like gemUnlockState.
  seenEventIds: [],
};

// The ONE mid-level modifier currently in effect, if any — an Elite
// fight or a no-detonation Challenge.
export const activeEventState = {
  type: null, // 'elite' | 'challenge' | null

  eliteDefId: null,
  eliteForLevel: null,
  eliteStartedAt: null,
  eliteDurationMs: null,

  challengeDefId: null,
  challengeForLevel: null,
  challengeDetonated: false,
};