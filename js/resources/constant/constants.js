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

// --- board shape/siz ---
export const BOARD_SIZE = 8;  // board is BOARD_SIZE x BOARD_SIZE
export const BOARD_DEFAULT__WIDTH = 8;  // default board width
export const BOARD_DEFAULT_LENGTH = 8;  // default board length

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
export const PREVENT_DEADLOCK = true;

// --- animation timing (ms) ---
// These are also hand-copied into the matching CSS transition/animation
// durations in css/animation/. If you change one, update the other —
// JS needs the numeric value to time its setTimeout calls, CSS needs it
// to actually play the animation, and there's no clean way to share a
// single number between the two without extra plumbing.
export const SWAP_ANIM_MS = 220;          // css/animation/swap.css
export const MATCH_CLEAR_DELAY_MS = 260;  // gems.css .matched pop animation
export const CASCADE_CHECK_DELAY_MS = 180; // pause before re-checking for cascades

// --- gem set ---
// The gems actually used in play. Index in this array = the "type"
// number (0..GEM_DEFINITIONS.length-1) stored in the board grid.
// `file` points at an SVG in css/model/svg/, loaded as each gem's
// background-image by render.js.
export const GEM_DEFINITIONS = [
  { name: "Amethyst", file: "amethyst.svg" },
  { name: "Diamond",  file: "diamond.svg" },
  { name: "Emerald",  file: "emerald.svg" },
  { name: "Garnet",   file: "garnet.svg" },
  { name: "Ruby",     file: "ruby.svg" },
  { name: "Sapphire", file: "sapphire.svg" },
  { name: "Topaz",    file: "topaz.svg" },
];

// Number of gem types in play, derived from the list above so it can
// never drift out of sync with GEM_DEFINITIONS.
export const GEM_TYPES_COUNT = GEM_DEFINITIONS.length;

// Designed and ready as SVG assets, but not yet wired into gameplay.
// Add an entry to GEM_DEFINITIONS above when one of these goes live.
export const FUTURE_GEM_DEFINITIONS = [
  { name: "Onyx",       file: "onyx.svg" },
  { name: "Aquamarine", file: "aquamarine.svg" },
  { name: "Bloodstone", file: "bloodstone.svg" },
  { name: "Pearl",      file: "pearl.svg" },
];

// --- tile shapes (construction/deconstruction) ---
// Each shape is a list of [rowOffset, colOffset] pairs relative to
// the cell the player clicks, which acts as the shape's top-left
// corner. Shared by both construction (bonus tiles) and
// deconstruction (blocked cells) so they use one picker UI.
export const TILE_SHAPES = {
  ONE_BY_ONE:   { label: '1×1', cells: [[0, 0]] },
  TWO_BY_TWO:   { label: '2×2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  ONE_BY_THREE: { label: '1×3', cells: [[0, 0], [0, 1], [0, 2]] },
  TWO_BY_THREE: { label: '2×3', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
};