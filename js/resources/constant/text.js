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
  LEAVE_SHOP: "Leave", // NEW
};

// --- dialog titles ---
export const DIALOG_TITLES = {
  LOSE: "Out of moves",
  NO_MOVES: "Game Over",
  LEVEL_UP: "Level Cleared!",
  BOON: "Choose a Boon",
  SHOP: "The Shop", // NEW
};

// --- static in-game messages (no interpolated values) ---
export const MESSAGES = {
  SELECT_PROMPT: 'select a gem, then an adjacent one to swap',
  INVALID_SWAP: 'no match there — try another pair',
  RESHUFFLING: 'no moves left on the board — reshuffling',
  STUCK_BOARD: 'no moves left on the board',
  // NEW — body text for the stuck-board game-over dialog. Shown after
  // STUCK_BOARD has sat in the #message line for
  // NO_MOVES_GAME_OVER_DELAY_MS (constants.js).
  NO_MOVES_GAME_OVER: 'no more valid moves remain on the board',
  // NEW — board expand/shrink placement errors. The "which shape /
  // which action" part of the message DOES interpolate a runtime
  // value (the shape's label), so that half stays as a template
  // literal in main.js per Rule 7 — these two are only the fixed
  // tail end of that message.
  EXPAND_INVALID: "that spot won't work — the whole shape must land on empty space touching your current board, and stay within the board's outer limit",
  SHRINK_INVALID: "that spot won't work — every cell in the shape must already be part of your board",
};

// Version
export const GAME_VERSION = "v0.2.1.0";