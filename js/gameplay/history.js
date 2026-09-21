// ============================================================
// HISTORY.JS — appends to and caps historyState.entries.
//
// One concern (Rule 5): this file ONLY manages the history LIST
// itself (push + reset + cap) — it never builds display strings and
// never touches the DOM. main.js decides the wording at each call
// site (same convention as showScorePopup()'s popupText) and does
// its own rendering (renderHistoryPanel()), same pattern as
// renderSideStats() — a small side panel doesn't need its own
// dedicated DOM module the way the board does (render.js/Rule 3 is
// specifically about BOARD DOM).
// ============================================================

import { historyState } from '../resources/history/history_state.js';

// Hard cap on how many lines the panel remembers. Without this, a
// very long run would grow historyState.entries (and the DOM list
// built from it) without bound. Trimmed from the OLD end so the
// panel always keeps the most RECENT activity.
const MAX_HISTORY_ENTRIES = 200;

/**
 * Appends one line to the history list.
 *
 * @param {'score' | 'boon'} kind - what kind of event this was.
 * @param {string} text - the line's fully-formatted display text.
 * @param {'positive' | 'negative' | 'neutral' | 'levelup' | 'boon'} tone -
 *   which color bucket this line renders in (layout.css's
 *   .history-entry--* rules). 'levelup' (gold) is level-cleared
 *   lines only; 'boon' (violet) is every boon-pick line, free or
 *   bought, regardless of buff/curse; 'positive'/'negative'/'neutral'
 *   remain score-only.
 * @returns {void}
 */
export function addHistoryEntry(kind, text, tone) {
  historyState.entries.push({ kind, text, tone });
  // Trim from the FRONT (oldest first) once past the cap.
  if (historyState.entries.length > MAX_HISTORY_ENTRIES) {
    historyState.entries.splice(0, historyState.entries.length - MAX_HISTORY_ENTRIES);
  }
}

/**
 * Clears the history list for a fresh run. Call from main.js's
 * init(), alongside every other resetX() call.
 *
 * @returns {void}
 */
export function resetHistory() {
  historyState.entries.length = 0;
}