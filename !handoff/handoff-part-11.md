# Handoff — Part 11: Massive Feature Wave — New Boons/Curses, Obsidian Gem,
# Event System Overhaul, Shop Redesign + Customer Service

Continues directly from Part 10. This single session covered an enormous amount of
ground across many back-and-forth rounds — this handoff consolidates all of it into
one document. See the file-mapping table below FIRST, since several output files
share a name with an existing project file in a different folder.

---

## 0. File-mapping note (READ THIS FIRST)

Every JS file delivered this session that shares a name with an existing project file
(because the project has both a `resources/` and a `gameplay/` copy of `boon.js`,
`curse.js`, `consumable.js`, `event.js`, `special_gem.js`) was given a disambiguating
output filename. Use the LATEST version of each (the highest `_v2`/`_v3`/`_final`
suffix, or the plain name if there's only one) — earlier ones were superseded within
this same session as requirements evolved (most notably the Challenge event, which
went through three revisions).

| Use this file | Goes to |
|---|---|
| `board.js` | `js/gameplay/board.js` |
| `obsidian.js` | `js/gameplay/obsidian.js` (new) |
| `gem_base.js` | `js/gameplay/gem_base.js` |
| `curse_resource.js` | `js/resources/curse/curse.js` |
| `curse_gameplay.js` | `js/gameplay/curse.js` |
| `boon_effect_state.js` | `js/resources/boon/boon_effect_state.js` |
| `boon_effects.js` | `js/gameplay/boon_effects.js` |
| `boon_resource_v3.js` | `js/resources/boon/boon.js` |
| `boon_gameplay_v3.js` | `js/gameplay/boon.js` |
| `score.js` | `js/gameplay/score.js` |
| `special_gem_gameplay_v2.js` | `js/gameplay/special_gem.js` |
| `consumable_resource.js` | `js/resources/consumable/consumable.js` |
| `consumable_gameplay_v2.js` | `js/gameplay/consumable.js` |
| `event_state_v3.js` | `js/resources/event/event_state.js` |
| `event_resource_v3.js` | `js/resources/event/event.js` |
| `event_gameplay_v3.js` | `js/gameplay/event.js` |
| `render.js` (+ `render_js_obsidian_fix.txt`) | `js/gameplay/render.js` |
| `customer_service_state.js` | `js/resources/shop/customer_service_state.js` (new) |
| `customer_service.js` | `js/gameplay/customer_service.js` (new) |
| `main_final.js` | `js/gameplay/main.js` |
| `obsidian.svg` | `css/model/svg/obsidian.svg` (new) |

CSS/HTML changes were given as merge-by-hand snippets, listed in Section 9 below.

---

## 1. Obsidian gem ("dead gem")

A permanent, inert board cell — `board.js` exports `OBSIDIAN = -2`, distinct from
`BLOCKED` (`null`) and the transient clear-marker (`-1`).

- **Never matches** — free, since `isGem()` already requires a non-negative value.
- **Never swappable** — `hasPossibleMove()`/`findHintMove()` (board.js) and
  `onCellClick()`/`onCellDragSwap()` (main.js) all skip it explicitly.
- **Falls via gravity like a normal gem** — `collapseAndFill()` needed no changes.
- **"Falls off the board"** once it reaches the true bottom of its column — new
  `gameplay/obsidian.js`'s `settleObsidianOffBoard()`, called after every
  `collapseAndFill()` pass in `continueCascadeAfterMatch()`. Loops until stable.
- **Rendering**: a real dedicated SVG now exists (`css/model/svg/obsidian.svg` — a
  faceted black gem, loaded the same way every other gem's art is), not a CSS-only
  placeholder as originally shipped.
- **Spawned by** Entropy/Luminous/Explosive Shard (see Section 2) — an independent 10%-
  per-copy roll on a plain match-3, separate from those same boons' "also spawn a
  bonus special gem" roll.
- **Known simplification**: a board reshuffle/tile-placement rebuild regenerates the
  whole grid from scratch and never reproduces Obsidian — any Obsidian on the board is
  silently wiped by a reshuffle.

---

## 2. New boon families

| Boon(s) | Rarity / Max | What's new |
|---|---|---|
| Forbidden `<Gem>` (11 entries) | Epic / 1 each | +250/+2.5 to one gem, -250/-2.5 to one random other gem. New effect kind `gem_forbidden_swap`. |
| Threesome/Foursome/Fivesome Matchmaker | Uncommon / 3 each | Additive bonus on top of the fixed per-match-size multiplier table. New `boonEffectState.matchSizeBonus` bucket. |
| Entropy/Luminous/Explosive Shard | Rare / 2 each | Match-3 now has a stacking 10%-per-copy chance of a bonus special spawn AND an independent 10%-per-copy chance of an Obsidian spawn. |
| Frantic Star | Epic / 2 | Hyperstar swap-activation also wipes a second random color; 5% chance/settle of an unprompted self-activation (always wipes 2 random colors). Presence-only marker. |
| Warmonger / Adventure Junkie | Uncommon / 1 each | +250 global bonus / +2.5 global multiplier (real, reversible), but the matching Decline button is struck-through and inert with a red note once held. |
| Perpetual Boon | Rare / Unlimited | +1% of score per copy, per level cleared. **Excluded** from normal offer pools — only appears as a last-resort filler when the offer can't otherwise be filled. |
| Overcharge Essence | Legendary / 2 | **Event-only** — granted exclusively by "A Test of Endurance" (Section 4). At the start of every level, converts 2 random plain gems/copy into a Laser/Discharger. |
| Booner | Rare / 3 | **Shop-only.** +25%/copy stacking chance of one bonus full boon offer right after the normal level-up pick resolves (capped at exactly one bonus offer per level, regardless of copies — only the CHANCE scales). |
| VIP Membership Card | Legendary / 1 | **Shop-only.** -10% on every shop price (boon cards, consumable squares, both Customer Service prices) — `main.js`'s `applyVipDiscount()`. |

The 4 pre-existing global boons were also retuned per the design sheet:
Gemstone Gamble is now a pure buff (no target increase, `BUFF`, Rare, max 5);
Trinket Wager is now Epic/max 5 at +300 bonus; Gem Greed is Epic/max 2; Jewel
Avarice is Legendary/max 2.

**Exclusion bookkeeping**: `resources/boon/boon.js` now exports both
`EVENT_ONLY_BOON_IDS` (`{overcharge_essence}`) and `SHOP_ONLY_BOON_IDS`
(`{booner, vip_membership_card}`) — `gameplay/boon.js`'s `generateBoonOffer()`/
`generateEqualWeightBoonOffer()` exclude BOTH sets (plus `perpetual_boon`) from every
normal offer, via one shared `isExcludedFromNormalOffers()` helper.

---

## 3. New curses — Decaying Birthstone / Petrified

Both fully implemented but **not wired to any grant trigger yet** (per your
confirmation — Decaying Birthstone is event-only and that event doesn't exist yet;
Petrified follows the same pattern). `grantCurse(curseId, data)` now takes optional
extra per-pick data (`trackedGemId`/`clearCount` for Decaying Birthstone, `lockedGem`
for Petrified), same shape `boon.js`'s `pickBoon(id, data)` already uses.

- **Decaying Birthstone**: `gameplay/curse.js`'s `recordDecayingBirthstoneActivity()`
  tracks each pick's own clear count independently; `main.js`'s
  `checkDecayingBirthstoneLethal()` ends the run immediately if any pick crosses 100.
- **Petrified**: `gameplay/gem_base.js`'s `getGemBaseMultiplier()` now checks
  `curseState` directly and returns a flat `0` for the locked gem, ignoring the
  underlying delta bucket entirely while the lock holds — a READ-TIME override, not a
  one-time zeroing, so it correctly "wins" over any multiplier boon applied while
  active.
- **NEW this round**: both curses (and Weight of Greed / Crystallized Parasite) can
  now actually be REMOVED, via the new Curse Removal Service (Section 7) —
  `removeActiveCurse()` already existed in `gameplay/curse.js` but had never been
  called anywhere until now.

---

## 4. New event — "A Test of Endurance" (went through 3 revisions)

A CHALLENGE-type event with real Win/Lose/Give-in outcomes (unlike Silent Vein's
single accept/silent-fail shape). Ended up needing THREE combined rules:

1. **Decay** — -5% of current score every 5 seconds, checked at cascade-settle time
   (`gameplay/event.js`'s `applyChallengeDecayIfDue()`) — explicitly NOT a live
   wall-clock timer; it lazily computes elapsed whole intervals and applies that many
   compounding deductions.
2. **Time limit** — must clear the level within 5 minutes. Resolved the EXACT same way
   Elite's `time_race` already is: only checked at the moment the level actually
   clears (score reaches target), inside `checkChallengeLevelClear()`. There is no
   independent timeout — if the player simply never clears the level, the challenge
   just never resolves through this path (same precedent Boon Hoarder already set).
3. **Normal target** — reaching the level's own score target is what makes rule 2's
   check even run.

Reuses the EXISTING multi-level Challenge engine (`durationLevels: 1`) rather than
needing a new win-condition system. Reward comes from a dedicated event-only pool
(`useEventOnlyRewardPool: true` → `candidatesFromEventOnlyPool()`), currently just
Overcharge Essence.

`startChallenge()`/`clearChallengeState()`/`event_state.js` gained
`challengeDecayPercent`/`challengeDecayIntervalMs`/`challengeLastDecayAt` and
`challengeStartedAt`/`challengeTimeLimitMs`.

**Small side-effect change**: `showChallengeDialog()`'s Decline button now shows
`def.declineText` via `showEventResult()` if the def declares one (A Test of
Endurance does; Silent Vein still doesn't, so its decline stays a silent close) — and
Accept now shows `def.acceptResultText` as a brief flavor beat before actually
continuing, if the def declares one.

---

## 5. Event dialog titles — "[Type] --- [Name]"

Every event dialog (Encounter/Elite/Challenge, and their result dialogs) now titles
itself e.g. "Elite --- The Gem Cultivator" instead of just "The Gem Cultivator" — new
`EVENT_TYPE_LABEL` map + `formatEventTitle()` helper in `main.js`, applied at every
`eventTitleEl.textContent = ...` call site (including baking the prefix into
`pendingEventResult.title` at the point `applyScoreGain()` builds it, since the
result dialog just displays whatever title it's handed).

---

## 6. Two bugfixes to special-gem chain reactions

1. **A Hyperstar caught in a Laser/Discharger's blast now actually fires** (wipes one
   random gem color), instead of being silently cleared with no effect — a
   long-flagged gap. `triggerRandomHyperstarWipe()` moved from `consumable.js` into
   `special_gem.js` (to avoid a circular import) and is now reused by BOTH the normal
   match/blast chain-reaction BFS (`resolveSpecialGems()`) and consumables' own chain
   reactions (unchanged behavior there, just relocated).
2. **Only a genuine L/T shape spawns a Discharger now** — per your confirmation, a
   solid block (e.g. a 3x2 rectangle) or a zigzag (two offset parallel runs) used to
   ALSO spawn a Discharger (any non-straight 4+ cell group did); these now spawn
   NOTHING at all, pending a dedicated special gem for those shapes later. New
   `findLTIntersection()` in `special_gem.js` validates that a non-straight group
   decomposes into exactly one horizontal run (3+) crossing exactly one vertical run
   (3+) at exactly one shared cell, with every cell in the group accounted for by one
   run or the other — a block fails because it has TWO qualifying runs on one axis; a
   zigzag fails because it has TWO qualifying runs on the other axis.

---

## 7. Shop redesign

### Customer Service section (new)

Two mutually-exclusive one-time-per-visit services (`customerServiceState.usedThisVisit`
locks out whichever wasn't used, resetting fresh every shop visit):

- **Curse Removal Service** — clicking opens an inline picker listing every active
  curse with its own "Remove" button. Shows "Not available" if the player holds no
  curses. Price is 25% / 50% / 75% of `shopEntryScore`, keyed by
  `customerServiceState.curseRemovalUseCount` — a RUN-WIDE (not per-visit) counter,
  reset only on "start over". New `gameplay/customer_service.js` +
  `resources/shop/customer_service_state.js`.
- **Limited Edition Boons Sale Service** — one random available shop-only boon
  (`SHOP_ONLY_BOON_IDS`) is rolled fresh every shop visit
  (`rollLimitedEditionBoonOffer()`); buying it costs the same as any other shop boon
  of its rarity (`calculateBoonPrice()`, reused as-is). Shows "Out Of Service" if
  nothing in that pool is currently available (e.g. everything already maxed out).

### Consumables now render as belt-style squares

Same convention as the belt (`.belt-slot`/`.belt-slot-icon`): a plain icon square with
a hover tooltip (name + description) instead of a full card with visible description
text. The price still sits below the square, in the same spot it always was.

### Shop boon cards now reuse the level-up dialog's `.boon-card` design

Previously the shop used a smaller, plainer `.shop-card`. It's now the exact same
`.boon-card`/`.boon-card--<rarity>` markup the free level-up dialog uses, with the
price folded into the existing footer row (now `display: flex` so the rarity badge
and price sit side by side). The shop dialog was widened/allowed to wrap
(3-per-row instead of forcing 5-in-a-row) and given `max-height: 90vh; overflow-y:
auto;` since it can now run considerably taller with everything stacked.

---

## 8. Resurrection Cross rework (earlier round, included for completeness)

`checkEndState()`'s stuck-board branch now delegates to `handleDeadlock()`:
- No Cross held → unchanged old behavior.
- Cross held, no OTHER board-changing consumable (Pickaxe/Dynamite/Dice) → shows an
  informational message and triggers the Cross directly.
- Cross held AND another board-changing consumable held → shows a new Yes/No dialog
  (`#deadlock-dialog`) offering to try a consumable first. "Yes" unblocks the board;
  every consumable-use path already ends by calling `checkEndState()` again on its
  own, so "if still deadlocked, repeat" falls out for free.

The Resurrection Cross's own name in these messages renders with the same
dashed-underline/hover-tooltip treatment boon/curse names get
(`formatConsumableNameSpan()`, new `.event-inline-name--consumable` CSS color).

---

## 9. Scoring/UI changes from earlier in the session (included for completeness)

- **Dice** reworked from a whole-board, no-target shuffle into a targeted 3x3 area
  shuffle (same flow as Pickaxe/Dynamite).
- **Global score formula reordered**: `(afterFlatBonuses + globalScoreBonus) *
  globalScoreMultiplier` — bonus is now added BEFORE the multiplier is applied
  (previously the reverse).
- **Silent Vein** extended from 1 level to 3 (`durationLevels: 3`), and a detonation
  failure now shows a proper result dialog (previously silent).
- **Side-stats panel** now fills the full viewport height (`height` instead of
  `max-height` in `layout.css`'s `.side-stats` rule), scrolling only if content
  actually exceeds it.

---

## 10. CSS/HTML snippets to merge (if not already applied from earlier rounds)

All given as find/replace snippets rather than full files, since each touches only a
small part of an otherwise-unchanged file:

- `index_html_v3.txt` — Customer Service markup + consumable-shop-choices class change
  + the deadlock dialog markup (skip the deadlock part if already added).
- `dialog_css_v3.txt` — `.boon-card-footer` flex layout, widened/wrapping shop
  dialog, consumable-square styles + tooltip, Customer Service card + curse-picker
  styles, and (if not already added) the Warmonger/Adventure Junkie locked-button
  styles + deadlock dialog choices row.
- `layout_css_changes.txt` (earlier round) — `.side-stats` height fix +
  `.event-inline-name--consumable` color rule.
- `gems_css_addition.txt` / `gems_css_obsidian_fix.txt` (earlier round) —
  superseded by the real `obsidian.svg` asset; the CSS now only needs a small
  `filter: drop-shadow(...)` rule on `.gem--obsidian` (see the `_obsidian_fix.txt`
  version specifically, not the original placeholder version).

---

## Known gaps / flagged simplifications carried into this round

- Decaying Birthstone / Petrified still have no in-game grant trigger.
- Pickaxe/Dynamite/Dice aren't wired into Elite gem-tracking, Challenge
  detonation-tracking, or Decaying Birthstone's clear-count tracking.
- A board reshuffle wipes any Obsidian gem present.
- Frantic Star's extra-target wipe folds its second color's cleared cells into the
  primary color's `matchedGroups` entry for scoring purposes (a documented, minor
  scoring simplification — see the inline comment in `handleHyperstarSingle()`).
- The "Stand your ground!" accept text for A Test of Endurance was corrected this
  round to remove a copy/paste reference to "the Gem Cultivator" from an earlier
  draft.