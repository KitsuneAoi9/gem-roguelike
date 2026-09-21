// ============================================================
// HISTORY_STATE.JS — mutable, per-run FIELD VARIABLE.
//
// Every line shown in the right-side "History" panel (main.js's
// renderHistoryPanel()), in the order they happened — newest entries
// are APPENDED to the end here; renderHistoryPanel() decides display
// order at render time (newest at the top) rather than this list
// storing itself reversed. Two entry "kinds" share one list even
// though they're logged from very different places in main.js (score
// kind from every cascade step/swap combo, boon kind from a boon
// pick) — a single merged timeline is the whole point of this panel.
// No functions here — see js/gameplay/history.js.
// ============================================================

export const historyState = {
  entries: [], // { kind: 'score' | 'boon', text: string, tone: 'positive' | 'negative' | 'neutral' }[]
};