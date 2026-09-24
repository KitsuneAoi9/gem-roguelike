# Handoff — Part 9: Belt Reposition, Numbered Event Choices (All Types), event-story Bugfix

Continues directly from Part 8. Small, mostly cosmetic follow-ups from testing the
consumable system and the event dialogs.

---

## 1. Consumable belt moved below the message line

**Previously (Part 8):** the belt sat beside the board, inside a new `.board-and-belt` flex
row wrapper, arranged as a vertical column of 3 slots.

**Now:** the belt sits directly below `#message` (the "select a gem..."/status line),
arranged as a horizontal row of 3 slots, centered. The `.board-and-belt` wrapper is gone —
`#board-wrap` reverts to owning its own `margin-top: 30px` directly, and `#consumable-belt`
is now a plain sibling of `#message` in the normal document flow.

The belt's hover tooltip direction also changed to match the new layout: it used to open to
the RIGHT of a slot (safe when the belt sat beside a wide, unobstructed board); now that the
belt is centered in its own row, it opens BELOW the hovered slot instead
(`left: 50%; transform: translateX(-50%);`), and its width was widened back to `220px` since
nothing clips it in this position either.

**Files touched:** `index.html` (belt markup moved, wrapper removed), `css/design/layout.css`
(`.board-and-belt` rule removed, `.board-wrap`'s margin restored, `.consumable-belt` switched
to a horizontal centered row, `.belt-slot[data-tooltip]:hover::after` repositioned/widened).

---

## 2. Numbered, single-column choice list — ALL event types, not just Encounter

Corrected from the initial ask: the numbered `1.`/`2.`/`3.` single-column list styling
applies to every event dialog's choice buttons — **Encounter** (Gem Mole, Fortune's Folly,
Lost Miner), **Elite** (fight/decline), and **Challenge** (accept/decline) alike. Only the
shared single-button "Continue" result screen (`showEventResult()`) stays on the original
centered layout — a lone acknowledgment button doesn't need a number in front of it.

**Mechanism (unchanged from the original Encounter-only version, just applied more
broadly):** each dialog-builder function now sets `eventChoicesEl.className = 'event-choices
event-choices--list';` before building its buttons, and every button's `textContent` gets a
`"N. "` prefix instead of the bare label. `showEventResult()` always resets
`eventChoicesEl.className` back to the plain `'event-choices'` centered default, regardless
of which dialog led into it.

**Files touched:** `js/gameplay/main.js` — `showGemMoleDialog()`, `showFortunesFollyDialog()`,
`showFollyPostWin()`, `showLostMinerDialog()` (all from the original ask), plus
`showEliteDialog()` and `showChallengeDialog()` (this round's correction). `css/design/dialog.css`
already had the needed `.event-choices--list` rule from the original ask — no CSS changes
this round.

### Note — `showChallengeDialog()`

This function didn't exist anywhere in the `main.js` shared with me, even though
`attemptEvent()` calls it — flagged during this round and confirmed already fixed on your
end (you'd written and added it yourself before I could ask). The numbered-list treatment
above assumes it follows the same `acceptLabel`/`declineLabel` shape every other
accept/decline dialog builder uses; if your actual implementation differs, just apply the
same two changes (the `className` line, the `"N. "` prefixes) to whatever you've got.

---

## 3. Bugfix — `.event-story` was styled as a class but never had one

Pre-existing bug, present since the event dialog was first built several sessions ago (not
introduced by Part 7's `text-align: left` change, which just added to an already-broken
rule): `css/design/dialog.css` has always styled `.event-story` as a CSS class selector, but
`index.html`'s `<p id="event-story"></p>` never actually carried a `class="event-story"`
attribute — only the id. The rule silently never applied at all.

**Fixed** (on your end, during testing) by adding the missing `class="event-story"` to that
`<p>` element.

A full audit of every other `id`/`class` pair across `index.html` against every CSS file
(`layout.css`, `dialog.css`, `typography.css`, `gems.css`, `select.css`, `swap.css`) plus
every dynamically-built class name in `main.js`/`render.js` turned up no other mismatches —
this was an isolated, one-off gap.

**Files touched:** `index.html` (`#event-story`'s `class` attribute).
