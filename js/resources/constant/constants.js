// ============================================================
// CONSTANTS.JS — single source of truth for game-mechanic values.
//
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

// --- board shape/size ---
// The board is now allocated at its maximum possible footprint from
// the moment a run starts (see tiles.js's resetTiles()), and a run
// begins with only the centered INITIAL_BOARD_SIZE x INITIAL_BOARD_SIZE
// square unblocked. Expand-board boons unblock more of the
// pre-allocated space outward from there; MAX_BOARD_SIZE is a hard
// ceiling no boon can push past (board.js's SIZE constant IS this
// value — see board.js for why the whole allocated grid, not just
// the visible part, needs to exist from the start).
export const INITIAL_BOARD_SIZE = 8;  // board size a fresh run starts with
export const MAX_BOARD_SIZE = 20;     // hard ceiling — expand-board boons can never grow past this

// --- scoring ---
export const POINTS_PER_GEM = 10; // score added per gem cleared in a match

// --- leveling ---
export const LEVEL_UP_BONUS_MOVES = 10; // extra moves granted each time a level is cleared

// --- deadlock handling ---
// When true, checkEndState() (main.js) reshuffles the board whenever
// no legal move remains, so the player is never truly stuck. Kept as
// a flag rather than removed logic so it can be toggled off later
// (e.g. a "hard mode" that allows real deadlocks) without having to
// rebuild the reshuffle logic from scratch.
export const PREVENT_DEADLOCK = false;

// --- moves-left mechanic (shelved for now) ---
export const ENABLE_MOVES_LIMIT = false;

// --- animation timing (ms) ---
// These are also hand-copied into the matching CSS transition/animation
// durations in css/animation/. If you change one, update the other —
// JS needs the numeric value to time its setTimeout calls, CSS needs it
// to actually play the animation, and there's no clean way to share a
// single number between the two without extra plumbing.
export const SWAP_ANIM_MS = 220;          // css/animation/swap.css
export const MATCH_CLEAR_DELAY_MS = 260;  // gems.css .matched pop animation
export const CASCADE_CHECK_DELAY_MS = 180; // pause before re-checking for cascades

// --- score popup (floating text above the board) ---
// How long a score popup stays visible before fading out. This text
// used to live in the #message line below the board with no
// explicit duration — it just sat there until the next thing
// overwrote it, which in practice was roughly one
// MATCH_CLEAR_DELAY_MS + CASCADE_CHECK_DELAY_MS cycle (~440ms). Now
// it floats above the board instead and gets its own explicit
// lifetime: a readable base duration, plus the extra ~1s that was
// asked for so it doesn't disappear mid-cascade.
export const SCORE_POPUP_MS = 1800;

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
// gems can still accumulate Lush/Maniac deltas before they're unlocked.
export const ALL_GEM_CATALOG = [...GEM_DEFINITIONS, ...FUTURE_GEM_DEFINITIONS];
export const ALL_GEM_IDS = ALL_GEM_CATALOG.map(g => g.id);


// --- tile shapes (board expansion/shrinking, AND the still-dormant
// bonus-tile marking feature — both read from this one shared table
// so they never drift into two different shape vocabularies) ---
//
// Each shape is a list of [rowOffset, colOffset] pairs relative to
// the cell the player clicks, which acts as the shape's top-left
// corner. Every shape's bounding box is capped at 5 rows x 5 cols
// per the design sheet ("max row 5 or max column 5 at a time") —
// don't add anything bigger than that without revisiting that cap.
export const TILE_SHAPES = {
  ONE_BY_ONE:     { label: '1×1', cells: [[0, 0]] },
  ONE_BY_TWO:     { label: '1×2', cells: [[0, 0], [0, 1]] },
  TWO_BY_ONE:     { label: '2×1', cells: [[0, 0], [1, 0]] },
  ONE_BY_THREE:   { label: '1×3', cells: [[0, 0], [0, 1], [0, 2]] },
  THREE_BY_ONE:   { label: '3×1', cells: [[0, 0], [1, 0], [2, 0]] },
  TWO_BY_TWO:     { label: '2×2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  TWO_BY_THREE:   { label: '2×3', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
  THREE_BY_TWO:   { label: '3×2', cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]] },
  ONE_BY_FIVE:    { label: '1×5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  FIVE_BY_ONE:    { label: '5×1', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  THREE_BY_THREE: {
    label: '3×3',
    cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ],
  },
  THREE_BY_FIVE: {
    label: '3×5',
    cells: [
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
    ],
  },
  FIVE_BY_THREE: {
    label: '5×3',
    cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
      [3, 0], [3, 1], [3, 2],
      [4, 0], [4, 1], [4, 2],
    ],
  },
  FIVE_BY_FIVE: {
    label: '5×5',
    cells: [
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
      [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
      [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
    ],
  },
};

// --- input (drag-to-swap) ---
// Minimum pointer travel (px) before a press-and-move gesture counts
// as a drag-swap instead of a plain click/tap. Keeps a small jitter
// or a slow, careful tap from accidentally firing a swap — the
// player has to actually flick toward a neighbor to trigger one.
export const DRAG_SWAP_THRESHOLD_PX = 16;

// --- stuck-board game over ---
// How long the "no moves left" status message sits on screen before
// the game-over dialog appears, once PREVENT_DEADLOCK is off and
// hasPossibleMove() comes back false. Gives the player a beat to
// read the board instead of the dialog slamming the screen the
// instant the cascade settles.
export const NO_MOVES_GAME_OVER_DELAY_MS = 2000;

// --- hint (idle nudge) ---
// How long the board can sit idle after the last real match/cascade
// (including a swap-activated special-gem combo) before a legal move
// gets highlighted for the player. Per design: does NOT reset on a
// failed/invalid swap attempt or a plain click/select — only an
// actual match restarts this clock. main.js's checkEndState() is the
// only place that reschedules it, since every call to checkEndState()
// is itself only ever reached as a consequence of a real match having
// just resolved (see its doc comment).
export const HINT_DELAY_MS = 10000;

// --- boon rarity gating ---
// Legendary-rarity boons never appear in any offer — free level-up
// dialog OR the shop — until the player has reached this level.
// Checked in gameplay/boon.js's isBoonAvailable(), which both offer
// generators (generateBoonOffer() and generateEqualWeightBoonOffer())
// already filter through, so gating it there covers both places at
// once.
export const LEGENDARY_UNLOCK_LEVEL = 6;