# Handoff — Part 10: New Boon/Curse Wave, Obsidian Gem, Dice Rework, Scoring
# Formula Reorder, Multi-Level Silent Vein, Resurrection Cross Rework

Continues directly from Part 9. This is a large round — a full new wave of boons and
curses (design sheet screenshot), a brand-new "dead gem" mechanic (Obsidian), Dice
reworked into a targeted 3x3 tool, a global scoring formula reorder, Silent Vein
extended to span 3 levels, and (as a same-session follow-up) two smaller UX changes:
the side-stats panel's height, and a full rework of how the Resurrection Cross
triggers.

---

## 0. File-mapping note (READ THIS FIRST)

Several new/updated files share the SAME NAME as an existing file, because this
project already has a `resources/` and a `gameplay/` copy of `boon.js`, `curse.js`,
`consumable.js`, `event.js`, and `special_gem.js` in different folders. Since this
handoff's file outputs were written flat (no folder structure), they're named to
disambiguate — map them back to the real project paths as follows:

| Output filename | Goes to |
|---|---|
| `board.js` | `js/gameplay/board.js` |
| `obsidian.js` | `js/gameplay/obsidian.js` (**new file**) |
| `gem_base.js` | `js/gameplay/gem_base.js` |
| `curse_resource.js` | `js/resources/curse/curse.js` |
| `curse_gameplay.js` | `js/gameplay/curse.js` |
| `boon_effect_state.js` | `js/resources/boon/boon_effect_state.js` |
| `boon_effects.js` | `js/gameplay/boon_effects.js` |
| `boon_resource.js` | `js/resources/boon/boon.js` |
| `boon_gameplay.js` | `js/gameplay/boon.js` |
| `score.js` | `js/gameplay/score.js` |
| `special_gem_gameplay.js` | `js/gameplay/special_gem.js` |
| `consumable_resource.js` | `js/resources/consumable/consumable.js` |
| `consumable_gameplay.js` | `js/gameplay/consumable.js` |
| `event_state.js` | `js/resources/event/event_state.js` |
| `event_resource.js` | `js/resources/event/event.js` |
| `event_gameplay.js` | `js/gameplay/event.js` |
| `render.js` | `js/gameplay/render.js` |
| `main.js` | `js/gameplay/main.js` |

CSS/HTML changes were given as snippets to merge in by hand (`index_html_addition.txt`,
`index_html_tooltip_update.txt`, `gems_css_addition.txt`, `dialog_css_addition.txt`,
`layout_css_changes.txt`) rather than full files, since those changes are small and
localized within otherwise-unchanged files.

---

## 1. New mechanic — Obsidian ("dead gem")

A permanent, present-but-completely-inert board cell, added per the design sheet's
Entropy/Luminous/Explosive Shard boons.

- **New sentinel**: `board.js` exports `OBSIDIAN = -2`, in the same family as `BLOCKED`
  (`null`) and the transient clear-marker (`-1`), but distinct from both.
- **Can never be matched**: this is free — `isGem()` already requires a non-negative
  number, and `OBSIDIAN` is negative, so every existing `findMatches()` call already
  treats it as unmatchable with zero logic changes.
- **Can never be swapped**: `hasPossibleMove()`/`findHintMove()` (board.js) now skip it
  exactly like `BLOCKED`; `main.js`'s `onCellClick()`/`onCellDragSwap()` do the same for
  direct player clicks/drags.
- **Falls via gravity like a normal gem**: `collapseAndFill()` needed NO changes — it
  only special-cases `BLOCKED` (floor) and `-1` (already cleared); Obsidian is neither,
  so it rides gravity normally.
- **"Falls off the board" when it reaches the true bottom of its column**: new
  `gameplay/obsidian.js`'s `settleObsidianOffBoard()`, called right after every
  `collapseAndFill()` pass in `continueCascadeAfterMatch()`. Loops until stable (a second
  Obsidian can drop into the newly-emptied bottom slot after the first one goes).
- **Rendering**: `render.js` draws it as a plain black square (`.gem--obsidian` in
  `gems.css`) — no real SVG art yet, same "placeholder, TBD" treatment every other
  special-gem asset in this project already has.
- **Known simplification**: a board reshuffle/tile-placement rebuild
  (`rebuildGridRespectingBlocked()`) regenerates the WHOLE grid from scratch via
  `createGridNoMatches()`, which never produces Obsidian — so any Obsidian currently on
  the board is silently wiped by a reshuffle. Flagging in case that's undesired later.

### Spawning it — Entropy/Luminous/Explosive Shard

Each of these three new boons gives a plain match-3 (which normally spawns nothing at
all) TWO independent extra rolls, both at 10% per copy held (stacking up to 2 copies =
20%):
1. A bonus special-gem spawn (Hyperstar for Entropy, Laser for Luminous, Discharger for
   Explosive) at the match's own spawn cell — checked in a FIXED priority order
   (Entropy → Luminous → Explosive) since a match-3 only has one spawn cell to give away.
2. An Obsidian spawn somewhere else on the board — a SEPARATE roll, so a match-3 can
   spawn BOTH a bonus special AND an Obsidian in the same step. This roll sums ALL
   currently-held shard boons' counts into one combined chance (documented
   simplification — simpler than rolling each type separately, and at most one Obsidian
   spawns per cascade step regardless).

All of this lives in `gameplay/special_gem.js`'s `resolveSpecialGems()` — a documented
new exception to that file's "read grid, don't write it" rule, writing the Obsidian
spawn's `OBSIDIAN` value directly into `grid` (same category of exception the existing
convert-and-detonate combos already have for `specialGemState.grid`).

---

## 2. New boon families (from the design-sheet screenshot)

### Forbidden `<Gem>` set (11 entries, one per gem in the full catalog)
`forbidden_<gemid>` — Epic, max 1 each. +250 score/+2.5 multiplier to the named gem,
-250/-2.5 to ONE random other unlocked gem (Brilliance's "random other gem" pattern,
just hitting both buckets on the same penalized gem). New effect kind
`gem_forbidden_swap`, fully reversible.

### Threesome / Foursome / Fivesome Matchmaker
Uncommon, max 3 each. Additive bonus (+0.5/+1/+1.5) on top of `base_score.js`'s fixed
`MATCH_BASE_MULTIPLIER` table for that specific match size. New
`boonEffectState.matchSizeBonus` bucket, read by `score.js`'s `getMatchSizeMultiplier()`.
New effect kind `match_size_multiplier_bonus`.

### Entropy / Luminous / Explosive Shard
Rare, max 2 each. See Section 1 above — their match-3 bonus-spawn/Obsidian-spawn rolls.
New `boonEffectState.shardPicks` bucket, new effect kind `match3_shard_chance`.

### Frantic Star
Epic, max 2. **Presence-only marker** (`effect.kind: 'flag_no_op'` — nothing for
`applyBoonEffect()` to actually do; checked directly via `gameplay/boon.js`'s new
`isBoonActive('frantic_star')`). Two behaviors:
- A normal Hyperstar+plain-gem swap now ALSO wipes a second random gem color, not just
  the one it was swapped with (`triggerHyperstarSingle()`'s new `extraRandomTarget` flag).
- 5% chance, checked once every time a cascade settles (`resolveMatches()`'s
  `!hasAnyMatch` branch), of a Hyperstar already on the board firing entirely on its own
  — new `triggerHyperstarSelfActivation()` (special_gem.js), always wipes two random
  colors, same as a boosted swap-activation. If it fires, it continues the cascade via
  the same `finishSwapActivatedCombo()` path every real combo already uses.

### Warmonger / Adventure Junkie
Uncommon, max 1 each. Their STAT half reuses the existing `global_score_boost` kind
(fully reversible, same machinery as Gem Greed etc.). Their "can no longer decline" half
is a presence-only `isBoonActive()` check in `main.js`'s `showEliteDialog()`/
`showChallengeDialog()`: the Decline/Leave button stays visible but gets
`.event-choice-locked` (strikethrough, `pointer-events: none`, dimmed, no click handler
attached at all), plus a red `.event-choice-lock-note` line right after it: "(Due to
Warmonger, you cannot select this option.)" / "(Due to Adventure Junkie, ...)".

### Perpetual Boon
Rare, Unlimited. A recurring, TRIGGERED gain (+1% of current score per copy held, at the
end of every level, same placement/timing as the Crystallized Parasite drain) — handled
entirely in `main.js`'s `applyScoreGain()` by counting `boonState.activeBoons` entries
with this id, no `boon_effects.js` case needed at all.

**Deliberately excluded from the normal weighted-roll candidate pool** in both
`generateBoonOffer()` and `generateEqualWeightBoonOffer()` (`gameplay/boon.js`) — it's a
LAST-RESORT FILLER only. `generateBoonOffer()` now pads any remaining unfilled slots with
it if the real pool genuinely couldn't fill every slot (every other offerable boon
already exhausted/maxed). The shop never offers it at all (no equivalent fallback
concept there).

### The 4 pre-existing global boons — retuned
Per the new design sheet:
- **Gemstone Gamble**: now a PURE buff (type flipped `RISKY_BUFF` → `BUFF`), no target
  increase at all anymore. +50 bonus, Rare, max 5 (was max 10).
- **Trinket Wager**: +300 bonus (was +150), Epic (was Rare), max 5 (was 10). Target +15%
  unchanged.
- **Gem Greed**: Epic (was Rare), max 2 (was 10). Numbers unchanged.
- **Jewel Avarice**: Legendary (was Rare), max 2 (was 10). Numbers unchanged.

---

## 3. New curses — Decaying Birthstone / Petrified

**Neither is wired to any in-game grant trigger yet** — same category of gap as the
long-dormant `shop.js` system. Both are meant to be handed out by a future event (per
your Q4 answer). The full supporting mechanism is built and ready:

- **`grantCurse(curseId, data = {})`** (gameplay/curse.js) now accepts an extra `data`
  object merged directly onto the new `activeCurse` entry — this is how
  `trackedGemId`/`clearCount` (Decaying Birthstone) and `lockedGem` (Petrified) attach at
  grant time, mirroring `boon.js`'s own `pickBoon(boonId, data)` shape.
- **Decaying Birthstone** — picks one random gem at grant time; `clearCount` accumulates
  independently PER PICK (two copies tracking the same gem need 200 clears between them,
  a different gem tracked completely separately, per your Q4 answer). New
  `recordDecayingBirthstoneActivity()` (gameplay/curse.js), called every cascade step
  right alongside `recordEliteGemActivity()`. If any pick crosses its 100-clear
  threshold, `main.js`'s `checkDecayingBirthstoneLethal()` immediately ends the run (the
  standard lose dialog, custom message) — checked at BOTH cascade call sites
  (`resolveMatches()` and `finishSwapActivatedCombo()`), with an early return so nothing
  else happens once the run is over.
- **Petrified** — picks one random gem at grant time (`lockedGem`). Implemented as a
  READ-TIME override, not a one-time zeroing: `gameplay/gem_base.js`'s
  `getGemBaseMultiplier(gemId)` now checks `curseState` directly for an active
  `gem_multiplier_lock` targeting that gem, and short-circuits to a flat `0` if found —
  regardless of whatever `gemBaseState`'s delta says. The underlying delta bucket still
  silently accumulates underneath from any further multiplier boon (nothing intercepts
  the WRITE side), it just has no visible effect while the lock holds — per your answer,
  "player needs to remove the curse in order to modify the multiplier again."

---

## 4. Dice reworked — targeted 3x3 shuffle (was whole-board, no target)

- `resources/consumable/consumable.js`: `CONSUMABLE_INFO[DICE].requiresTarget` flipped
  `false` → `true`. This alone routes Dice through the SAME targeting flow
  Pickaxe/Dynamite already use (`onBeltSlotClick()`'s existing `requiresTarget` branch) —
  no new UI plumbing needed.
- `gameplay/consumable.js`: the old whole-board `triggerDiceShuffle()` is REMOVED,
  replaced by `triggerDiceShuffleArea(grid, row, col)` — a 3x3 area centered on the
  target click (same edge-clipping as Dynamite), Fisher-Yates shuffling only the colors
  within that area. Obsidian cells are excluded from the shuffle pool (can't be altered
  at all, sits out of whatever area it's caught in).
- `main.js`: `handleConsumableTargetClick()` gained a dedicated Dice branch (no clearing/
  scoring at all, just the shuffle, then the normal cascade pipeline catches whatever
  matches the shuffle happens to create). The old no-target `activateDiceConsumable()` is
  removed entirely — dead code once Dice requires a target.

---

## 5. Scoring formula — global bonus/multiplier order swapped

`score.js`'s `calculateCascadeStepScore()`:

```
OLD: finalScore = afterFlatBonuses * globalScoreMultiplier + globalScoreBonus
NEW: finalScore = (afterFlatBonuses + globalScoreBonus) * globalScoreMultiplier
```

Both are still the LAST two steps of the pipeline — only their relative order flipped,
per your confirmation ("those two steps are still the last two steps, but add the global
bonus score first, then apply the multiplier"). Applied everywhere this order was used —
`calculateCascadeStepScore()` is the only place it lived; `calculateGemAttributedScore()`
(Elite's `gem_subscore_race` tracking) already deliberately EXCLUDES the bonus entirely
(its own doc comment explains why), so it needed no change at all.

Also updated the two `data-tooltip` strings on the side-stats panel's Global
Multiplier/Global Bonus labels (`index.html`) to describe the new order.

---

## 6. Silent Vein — now spans 3 levels

`resources/event/event.js`'s `CHALLENGE_POOL` entry gained `durationLevels: 3`, plus real
`failText` (previously `null` — a detonation used to fail completely silently, no dialog
at all; it now shows a proper result dialog on a loss too, per your Q13 answer).

`gameplay/event.js`: `resolveChallengeOutcome()` is REPLACED by
**`checkChallengeLevelClear()`**, called once per level actually cleared while a
Challenge is active (checked EVERY level now, not gated on the one level it started on):

- A detonation at ANY point in the 3-level window fails the WHOLE challenge immediately,
  the instant the level it happened on clears — checked at the end of each level, per
  your answer ("it checks at the end of each level... by level 3, if you didn't detonate
  any, you win the rewards, but if by the end of level 1 you fail, then the result dialog
  pops up").
- No detonation yet, levels remain → returns `null` ("still in progress, say nothing").
- No detonation, last level in the window → resolves as a win, grants the reward.

`main.js`'s `applyScoreGain()` calls this unconditionally whenever
`activeEventState.type === CHALLENGE` (removed the old level-equality gate), and only
shows a dialog/History line when it returns non-null. `updateObjectiveBanner()`'s
Challenge branch now shows "clear N more levels without triggering any special gem."

---

## 7. Follow-up UX request #1 — side-stats panel height

`css/design/layout.css`'s `.side-stats` rule: `max-height: calc(100vh - 64px)` →
`height: calc(100vh - 64px)`. It now always fills the available viewport height (like
`.history-panel` visually already appears to, in practice), with `overflow-y: auto`
kicking in only once its own content genuinely exceeds that height — no other property
changed.

---

## 8. Follow-up UX request #2 — Resurrection Cross rework

The Cross no longer auto-consumes itself silently the instant the board is stuck.
`main.js`'s `checkEndState()` now delegates its stuck-board branch entirely to a new
**`handleDeadlock()`**:

1. **No Resurrection Cross held at all** — unchanged old behavior (`PREVENT_DEADLOCK`
   reshuffle, or the stuck-board game-over dialog after a delay).
2. **Resurrection Cross held, but no OTHER board-changing consumable
   (Pickaxe/Dynamite/Dice) in the belt** — nothing else worth offering first, so it just
   shows an informational message and triggers the Cross directly: *"There are no more
   valid moves, but you are given a second chance by your **Resurrection Cross**!
   Reshuffling..."* (the Cross's name renders with the same dashed-underline/hover-
   tooltip treatment boon/curse names already get, via new `formatConsumableNameSpan()`).
3. **Resurrection Cross held AND at least one board-changing consumable held** — shows a
   new **Yes/No dialog** (`#deadlock-dialog`, new markup) instead: *"There are no more
   valid moves. Would you like to use one of your consumable items first, before your
   Resurrection Cross activates?"*
   - **No** → triggers the Cross exactly like case 2 above.
   - **Yes** → dialog closes, board unblocks (`busy = false`) so the player can use ANY
     belt item. Every existing consumable-use code path already ends by calling
     `checkEndState()` again on its own (directly, or via the cascade settling) — so "if
     after using it, they are still deadlocked, repeat the process" falls out for free,
     with zero extra bookkeeping: `checkEndState()` just calls `handleDeadlock()` again,
     which re-evaluates from scratch (a different consumable might still be held, or none
     at all, or the deadlock might now be resolved entirely).

New `triggerResurrectionCross(entry, messageHtml)` is the single shared reshuffle-and-
consume step both the direct-trigger path and the dialog's "No" answer call into. It also
now calls `checkEndState()` again once the reshuffle finishes, as a safety net (a fresh
reshuffle should essentially never still be stuck, but this makes the whole flow
self-correcting for free if it somehow is).

**Files touched:** `main.js` (`handleDeadlock()`, `showDeadlockChoiceDialog()`,
`triggerResurrectionCross()`, `formatConsumableNameSpan()`, two new button listeners,
`checkEndState()`'s stuck-board branch simplified to just call `handleDeadlock()`),
`index.html` (`#deadlock-dialog` markup), `css/design/dialog.css`
(`.deadlock-dialog-choices`), `css/design/layout.css`
(`.event-inline-name--consumable`).

---

## Known gaps / flagged simplifications carried into this round

- **Obsidian has no real SVG art yet** — plain black CSS square placeholder, same
  category as every other "art not started" note already in this project.
- **A board reshuffle wipes any Obsidian on the board** (Section 1) — not flagged as a
  problem, just noted in case it should be preserved through a reshuffle later.
- **Decaying Birthstone / Petrified have no grant trigger wired up yet** (Section 3) —
  fully functional otherwise, waiting on a future event.
- **Frantic Star's `handleHyperstarSingle()` under-attributes scoring slightly** when
  active: the second random-color wipe's cleared cells get folded into the SAME
  `matchedGroups` entry as the primary target color, so they're scored as if they were
  that color rather than their own — a deliberate simplification (see the inline comment
  in `main.js`) rather than splitting into two separately-scored groups for an effect
  that's meant to feel like "more stuff exploded."
- **Pickaxe/Dynamite/Dice still aren't wired into Elite gem-tracking, Challenge
  detonation-tracking, or Decaying Birthstone's clear-count tracking** — same
  pre-existing gap flagged in Part 8, now extended to include the new curse tracking too.