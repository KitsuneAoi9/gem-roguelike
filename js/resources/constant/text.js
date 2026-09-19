// ============================================================
// TEXT.JS — single source of truth for user-facing strings.
//
// Same role as constants.js, but for words instead of numbers: game
// name/tagline, button labels, dialog titles, and static in-game
// messages. Strings that need to interpolate a runtime value (score,
// level, combo count, etc.) stay as template literals in main.js —
// only the fixed wording lives here.
// ============================================================

// --- display text ---
export const GAME_NAME    = "KitsuneAoi";
export const GAME_TAGLINE = "A fun hobby game";

// --- buttons ---
export const BUTTONS = {
  RESET: "start over",
  NEXT_LEVEL: "Next Level",
};

// --- dialog titles ---
export const DIALOG_TITLES = {
  LOSE: "Out of moves",
  LEVEL_UP: "Level Cleared!",
  BOON: "Choose a Boon",
};

// --- static in-game messages (no interpolated values) ---
export const MESSAGES = {
  SELECT_PROMPT: 'select a gem, then an adjacent one to swap',
  INVALID_SWAP: 'no match there — try another pair',
  RESHUFFLING: 'no moves left on the board — reshuffling',
  STUCK_BOARD: 'no moves left on the board',
};