// ============================================================
// CONSTANTS.JS — single source of truth for game-mechanic values.

// Anything that used to be a "magic number" scattered across
// board.js / main.js / render.js / index.html should live here
// instead, so there's only one place to change starting values,
// board dimensions, or the gem set. User-facing strings (game name,
// button labels, dialog titles, in-game messages) live in text.js
// instead — this file is numbers/data, that one is words.
// ============================================================;

// --- starting values ---
export const DEFAULT_SCORE = 0;
export const DEFAULT_MOVES = 30;

// --- board shape/siz ---
export const BOARD_SIZE = 8;
export const BOARD_DEFAULT__WIDTH = 8;
export const BOARD_DEFAULT_LENGTH = 8;

// --- leveling ---
export const LEVEL_UP_BONUS_MOVES = 10;

// --- deadlock handling ---
export const PREVENT_DEADLOCK = true;

// --- moves-left mechanic (shelved for now) ---
export const ENABLE_MOVES_LIMIT = false;

// --- animation timing (ms) ---
export const SWAP_ANIM_MS = 220;
export const MATCH_CLEAR_DELAY_MS = 260;
export const CASCADE_CHECK_DELAY_MS = 180;

// --- gem set ---
// `id` is the lowercase key used everywhere boons/gem-base-state key
// off a gem (BOON_POOL, gemBaseState, gemUnlockState) — keep it in
// sync with those ids if a gem is ever renamed.
export const GEM_DEFINITIONS = [
  { id: 'amethyst', name: "Amethyst", file: "amethyst.svg" },
  { id: 'diamond',  name: "Diamond",  file: "diamond.svg" },
  { id: 'emerald',  name: "Emerald",  file: "emerald.svg" },
  { id: 'garnet',   name: "Garnet",   file: "garnet.svg" },
  { id: 'ruby',     name: "Ruby",     file: "ruby.svg" },
  { id: 'sapphire', name: "Sapphire", file: "sapphire.svg" },
  { id: 'topaz',    name: "Topaz",    file: "topaz.svg" },
];

export const GEM_TYPES_COUNT = GEM_DEFINITIONS.length;

// Designed as SVG assets, not yet wired into board gameplay — but
// ARE already part of the boon system (locked behind gemUnlockState
// until a future research system unlocks them).
export const FUTURE_GEM_DEFINITIONS = [
  { id: 'onyx',       name: "Onyx",       file: "onyx.svg" },
  { id: 'aquamarine', name: "Aquamarine", file: "aquamarine.svg" },
  { id: 'bloodstone', name: "Bloodstone", file: "bloodstone.svg" },
  { id: 'pearl',      name: "Pearl",      file: "pearl.svg" },
];

// Full 11-gem roster (7 active + 4 future/locked) — used to build the
// per-gem boon pool and to seed per-gem base-value state so locked
// gems can still accumulate Lust/Maniac deltas before they're unlocked.
export const ALL_GEM_CATALOG = [...GEM_DEFINITIONS, ...FUTURE_GEM_DEFINITIONS];
export const ALL_GEM_IDS = ALL_GEM_CATALOG.map(g => g.id);

// --- tile shapes (construction/deconstruction) ---
export const TILE_SHAPES = {
  ONE_BY_ONE:   { label: '1×1', cells: [[0, 0]] },
  TWO_BY_TWO:   { label: '2×2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  ONE_BY_THREE: { label: '1×3', cells: [[0, 0], [0, 1], [0, 2]] },
  TWO_BY_THREE: { label: '2×3', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
};