# Handoff — Part 7: Hint Timer Fix, Elite/Challenge Result Dialogs, Styled Boon/Curse
# Names, Gem Cultivator Rework, Side-Stats Additions

Continues directly from Part 6. Seven items this round: one bugfix, two UI/text features,
one styling feature (with real code-reuse implications), one boon-design change, and two
side-stats panel additions.

---

## 1. Bugfix — hint countdown permanently killed by any failed swap attempt

**Reported symptom:** the idle hint (`HINT_DELAY_MS` after the last real match) only ever
showed up if the player never attempted an invalid swap at all — any failed match attempt
seemed to disable it entirely.

**Root cause:** `attemptSwap()` cancels the pending hint timer (`clearTimeout(hintTimeoutId)`)
unconditionally at its very top, before knowing whether the swap will succeed. The valid-swap
path eventually calls `checkEndState()` (via `resolveMatches()`'s settle branch), which is the
only place that reschedules it — but the INVALID-swap path (the revert branch inside case 8)
never called `checkEndState()` at all. So a failed attempt cancelled the timer and then just...
never restarted it, leaving the hint dead until the player's next successful match.

**Fix:** `scheduleHintTimer()` is now also called inside the invalid-swap branch's
`setTimeout(() => { busy = false; ... }, SWAP_ANIM_MS)` callback — i.e. the moment the revert
animation finishes and input is live again. A failed swap attempt now just restarts the
countdown fresh, exactly like a successful one does, instead of leaving it dead.

**Files touched:** `js/gameplay/main.js` (`attemptSwap()`'s invalid-swap branch).

---

## 2. Elite/Challenge outcomes now show a proper result dialog

**Previously:** an Elite fight or Challenge resolving only ever wrote a line into the History
panel (`addHistoryEntry('event', ...)`) — no in-the-moment popup. The player had to notice it
in the side log after the fact.

**Now:** the exact same result text is ALSO shown as a dialog, reusing the shared
`#event-dialog` every other event type already uses, positioned right before the "Level
Cleared!" dialog in the same flow.

**Mechanism:** `applyScoreGain()` now stashes `pendingEventResult = { title, text }` (title =
the Elite/Challenge def's `name`, now returned by `resolveEliteOutcome()`/
`resolveChallengeOutcome()`) whenever either resolves. `resolveMatches()`'s deferred level-up
branch reads and clears that stash: if present, it shows `showEliteChallengeResultDialog()`
first, and only opens the level-up dialog once the player dismisses it; if absent, behavior is
unchanged from before.

**Files touched:** `js/gameplay/main.js` (`pendingEventResult` state, `applyScoreGain()`,
`resolveMatches()`, new `showEliteChallengeResultDialog()`), `js/gameplay/event.js`
(`resolveEliteOutcome()`/`resolveChallengeOutcome()` now also return `name`).

### Known simplification (flagged, not fixed)

The Crystallized Parasite's per-level drain (see §5) logs to History as its OWN separate line, not
merged into the Elite result dialog's text — even though, on the level the curse is granted,
both happen within the same `applyScoreGain()` call. Simpler to implement; the player will see
the drain amount in History right after dismissing the dialog rather than in the same popup.
Flag if you'd rather they be combined into one message.

---

## 3. Event dialog: newlines + left alignment

**Newlines:** `.event-story` already renders `white-space: pre-line` — `\n` inserts a line
break, `\n\n` inserts a paragraph break (blank line). No code change needed here; this is just
how you write flavor/result text in `resources/event/event.js` (already the convention used
throughout, e.g. Fortune's Folly's `storyText`).

**Alignment:** `.event-story` was inheriting `.dialog-box`'s `text-align: center`. Added an
explicit `text-align: left` override — title and choice buttons are untouched (still centered).

**Files touched:** `css/design/dialog.css` (`.event-story`).

---

## 4. Boon/curse reward names: dashed underline, hover tooltip, rarity/curse color

New shared markup builder, `formatNamedEffectSpan(def, isCurse)` (`gameplay/event.js`),
producing `<span class="event-inline-name event-inline-name--<rarity|curse>" data-tooltip="...">Name</span>`.
Colors reuse the exact same `--rarity-common/uncommon/rare/epic/legendary` CSS variables the
boon/shop cards already use; curses get a new dedicated `--curse-color` instead (no rarity of
their own).

**Scope — "reward" mentions only, not every boon-name occurrence in the game:**
- Gem Mole's trade result (`resultAcceptText`)
- Lost Miner's absorb result (`absorbResultText`)
- Boon Hoarder's win/lose/decline text (`grantedNames`/`removedNames`, built inside
  `applyEliteOutcomeEffect()`)
- The new Curses list in the side-stats panel (§7)

**Deliberately NOT touched:** the free level-up dialog's "Boon picked: X — description" History
line, and the shop's "Bought from shop: X (-price) — description" line — both already show the
full description inline, so a hover tooltip on the name would be redundant there.

**Mechanical consequence — two render paths switched from `textContent` to `innerHTML`:**
`showEventResult()` (the event dialog's result body) and `renderHistoryPanel()` (every History
line). Both now render arbitrary HTML instead of plain text — safe here since every string that
reaches either function is built entirely from this game's own static data (BOON_POOL/
CURSE_POOL entries), never from raw user input. `formatNamedEffectSpan()` also runs description
text through a small `escapeHtmlAttr()` helper before embedding it in `data-tooltip="..."`, as
a defensive measure in case a future description ever contains a literal quote/angle-bracket.

**Known constraint (shared with Part 6 §1's original tooltip bug):** `.event-inline-name`'s
tooltip is capped at a uniform `160px` width, rather than sizing differently per context. This
same span can land inside the narrow `#side-stats`/`#history-panel` (both `overflow-y: auto`,
same clipping risk Part 6 fixed for the global-stat tooltips) OR the much roomier event dialog.
160px is the one width that's safe everywhere it can appear — it just looks a little
small/tall when it shows up inside the spacious event dialog, where more room was available.

**Files touched:** `js/gameplay/event.js` (`formatNamedEffectSpan()`, `escapeHtmlAttr()`,
`applyEliteOutcomeEffect()`, `resolveLostMinerAbsorb()` now returns full defs instead of plain
name strings), `js/gameplay/main.js` (`showEventResult()`, `renderHistoryPanel()`, Gem Mole/Lost
Miner handlers), `css/design/layout.css` (`--curse-color`, `.event-inline-name` + modifiers).

---

## 5. Gem Cultivator rework — Crystallized Parasite instead of a direct -50% loss

**Old `onLose`:** `{ kind: 'score_percent', percent: -0.50 }` — an immediate, one-time score
deduction, resolved and applied the instant the fight's outcome is determined.

**New `onLose`:** `{ kind: 'grant_curse', curseId: 'crystallized_parasite' }` — implants a brand-new
curse, **Crystallized Parasite** (`resources/curse/curse.js`), instead. `onWin` (+50%, one-time) is
UNCHANGED.

### New outcome kind — `grant_curse`

Added to `applyEliteOutcomeEffect()`'s tagged union (`gameplay/event.js`). Mirrors the exact
`grantCurse()` + `applyBoonEffect()` two-step every other curse/boon grant in the codebase
already follows. `scoreDelta` is always `0` — this outcome kind never touches score directly;
whatever the granted curse actually DOES is entirely up to that curse's own effect shape.

### New curse — Crystallized Parasite (recurring, not a static delta)

```js
{
  id: 'crystallized_parasite',
  name: 'Crystallized Parasite',
  description: 'A parasite saps 15% of your current score at the end of every level, before any shop visit.',
  effect: { kind: 'parasite_score_drain', percent: 0.15 },
}
```

This is architecturally DIFFERENT from every prior curse/boon effect kind: it's a **recurring,
TRIGGERED** effect (fires again every time a level clears, for as long as it's active), not a
one-time **static delta** to `gemBaseState`/`boonEffectState`. `applyBoonEffect()` deliberately
has NO case for `'parasite_score_drain'` — its `default` branch (`reversible: false`) is exactly
correct, since there's nothing for that dispatcher to apply or later reverse.

The actual draining logic lives in `main.js`'s `applyScoreGain()`, inside the same `while`
loop that calls `advanceLevel()` — checked via `gameplay/curse.js`'s new
`getActiveCurseDefsByKind('parasite_score_drain')` once per level the loop crosses. A
multi-level jump (one big cascade crossing several targets at once) drains once PER level,
compounding on whatever score is left after the previous drain within that same call.

"At the end of the level, before any shop visit" is satisfied for free by WHERE this check
lives — `applyScoreGain()`'s while loop runs to completion well before
`proceedAfterBoonPick()` ever gets a chance to open the shop later in the sequence.

The drain starts on the SAME level it's granted (not "starting next level" the way Weight of
Greed explicitly is) — since granting happens earlier in the same while-loop iteration
(inside `resolveEliteOutcome()`, called before `advanceLevel()`), the newly-active curse is
already present in `curseState.activeCurses` by the time the drain check runs later in that
same iteration.

**New loseText** (user-provided, reformatted with `\n\n` paragraph breaks per §3, and two
missing spaces fixed — "away.He" → "away. [paragraph break] He", "react.A" → "react. A"):

```
The Gem Cultivator's technique overwhelms you. Before you can complete the challenge, the
opportunity slips away.

He smiles as the gemstone's energy fades. "Your talent may be lacking, but your body will
more than make up for it."

A strange parasite emerges from his hand and burrows into your body before you can react. A
parasite curse has been implanted within you.
```

**Files touched:** `resources/event/event.js` (Gem Cultivator's `onLose`/`loseText`),
`resources/curse/curse.js` (new `crystallized_parasite` entry), `gameplay/curse.js` (new
`getActiveCurseDefsByKind()`), `gameplay/event.js` (`grant_curse` case in
`applyEliteOutcomeEffect()`), `main.js` (`applyScoreGain()`'s per-level drain check).

---

## 6. Side-stats panel — target score multiplier (new footer row)

New read-only row below the gem list, its own `border-top` divider (mirroring
`.side-stats-global`'s existing divider up top). Reads `boonEffectState.targetScoreMultiplier`
— the exact number every `calculateScoreTarget()` call already multiplies by — colored via the
same `statDiffClass()` every other side-stat already uses (default `1.0`).

**Files touched:** `index.html` (`#target-multiplier` + `.side-stats-footer` markup),
`css/design/layout.css` (`.side-stats-footer`), `js/gameplay/main.js` (`targetMultiplierEl` ref,
`renderSideStats()`).

---

## 7. New — Active Curses list (bottom of the side-stats panel)

New section, `renderCursePanel()`, appended below the target-multiplier footer inside the SAME
`#side-stats` panel (not a separate floating panel — easiest to relocate once a real design is
settled). Lists every entry in `curseState.activeCurses` by name, styled via the same
`formatNamedEffectSpan(def, true)` markup used for curse mentions in event text (§4) — dashed
underline, hover tooltip showing the curse's description, dedicated curse color. Shows "No
active curses." when the list is empty, rather than a blank gap.

Folded into the END of `renderSideStats()` rather than given its own separate call sites — every
existing place that already calls `renderSideStats()` after a curse-granting action (Lost
Miner's absorb, an Elite loss) picks up the curse-list refresh for free.

**Design is explicitly a placeholder** per this round's ask — plain name + tooltip, matching the
game's existing "small side-panel list" visual language (gem-stats rows, history entries) rather
than anything bespoke. Happy to revisit once you've settled on the real design.

**Files touched:** `index.html` (`#curse-list` + `.side-stats-curses` markup),
`css/design/layout.css` (`.side-stats-curses`, `.curse-list`, `.curse-entry`, `.curse-empty`),
`js/gameplay/main.js` (`curseListEl` ref, new `renderCursePanel()`, called from
`renderSideStats()`).

---

## Known gaps / flagged simplifications carried into this round

- **Crystallized Parasite drain shown separately from the Elite result dialog** — see §2's Known
  simplification note.
- **`.event-inline-name` tooltip width is a one-size-fits-all compromise** — see §4's Known
  constraint note. Same category of limitation as the side-stats tooltip fix in Part 6 §1, just
  extended to a new, more widely-reused piece of markup.
- **Active Curses list design is a deliberate placeholder** — see §7.
