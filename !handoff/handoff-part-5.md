# Handoff — Part 5: Bugfixes, Boon Redesign, Milestone Scoring, and the Event System

Continues directly from Part 4. Scope: two standalone bugfixes, a full redesign of the
per-gem boon pool (with a reversible-effect foundation), a milestone-scaling target-score
formula, and a brand-new Event system (Encounter/Elite/Challenge) built on top of that
reversible-boon foundation — including a full rewrite of the Elite subsystem partway
through this round once the original single-shape Elite (Gem Elitist) was replaced with
three structurally different fights.

---

## 1. Bugfix — special-gem swaps invisible to the "no moves" check

`hasPossibleMove()`/`findHintMove()` (`board.js`) only ever tested "would this swap form a
color match?" via `findMatches()`. But per `attemptSwap()`'s dispatch order, any swap where
either cell is a Hyperstar, or both cells are some special gem (Laser/Discharger in any
combination), is *always* legal — it triggers a combo regardless of color. A board whose
only legal move was e.g. two adjacent Dischargers used to read as stuck.

Fixed: both functions gained an `isSpecialSwap(r1,c1,r2,c2)` predicate, checked before the
color-match clone-test. `main.js`'s new `isSpecialSwapPair()` builds the actual check
(mirrors `attemptSwap()`'s case dispatch: Hyperstar-involved → always legal; both-special-
but-no-Hyperstar → always legal; otherwise fall through to normal match detection), passed
at both call sites (`checkEndState()`, `showHintNow()`).

**Files touched:** `board.js` (`hasPossibleMove`, `findHintMove`), `main.js` (new
`isSpecialSwapPair()`, two call-site updates).

---

## 2. Bugfix — shop prices drifted down after each purchase

`calculateBoonPrice()` includes a `rarity% x score` term, and `renderShopDialog()` was
reading the **live** `score` variable — so each purchase lowered `score`, which
immediately cheapened every other card still on the shelf.

Fixed: a new `shopEntryScore` module-level variable in `main.js`, snapshotted once in
`openShopDialog()` and used by every price calculation for the rest of that visit,
regardless of how many purchases happen. The subtitle ("Your score: X") still shows live
score — only pricing itself is now pinned to the snapshot.

**Files touched:** `main.js` (`openShopDialog()`, `renderShopDialog()`).

---

## 3. Boon pool redesign

Replaced the old 10-archetype-per-gem pool with an 11-archetype design (Polish is new),
plus two brand-new non-gem-scoped "non-series" boons (Jeweler/Gemologist). Full per-gem
catalog is now 11 gems x 11 archetypes = 121 entries.

### Numbers/rarities/caps changed across the board
Every archetype's amount, rarity, and `maxOccurrences` moved to match the new design
sheet — see `resources/boon/boon.js`'s `GEM_ARCHETYPES` for the authoritative numbers.
Grandeur/Fanatic remain Legendary-only, gated behind `LEGENDARY_UNLOCK_LEVEL` as before.

### Targeted-random-penalty archetypes (Frenzy, Brilliance, Addict)
These three used to penalize **every** other gem in the catalog. They now penalize exactly
**two random other gems**, chosen fresh at pick time and stored on the pick itself
(`penalizedGems`), never re-rolled. Opulence and the two non-series boons are UNCHANGED — they
still hit every gem, by design.

**Bugfix within this feature:** the random draw was initially pulling from locked/future
gems (Onyx etc.) too — a penalty invisible in the side panel and a bad head-start debuff
for a gem before it's even unlocked. `pickRandomOtherGems()` (`boon_effects.js`) now
filters to unlocked gems only.

### New archetype — Polish
Bumps both base score (+5) AND base multiplier (+0.1) in one pick, no drawback, no cap
(`maxOccurrences: null`). New effect kind `gem_polish`.

### New non-series boons — Jeweler / Gemologist
Global, not gem-scoped at all: Jeweler (+25 base score to every gem, Epic, cap 2),
Gemologist (+1.5 base multiplier to every gem, Legendary, cap 2). New effect kinds
`all_gem_score_delta` / `all_gem_multiplier_delta`.

### Reversibility foundation (the load-bearing change)
Every boon-granting call site (`pickBoon()`, and the new `grantBoonBypassingCap()`) now
tags each `activeBoons` entry with a unique `pickId`. `applyBoonEffect(def)` now **returns**
a normalized "appliedEffect" record describing exactly what it mutated — including any
randomly-chosen penalty targets — and the caller attaches it:
`activeBoon.appliedEffect = applyBoonEffect(def)`. A new `reverseBoonEffect(activeBoon)`
undoes exactly that recorded effect (never re-derives or re-rolls anything), and
`removeActiveBoon(pickId)` deletes one specific pick out of the boon list. This is the
foundation the whole Event system (Section 5) is built on, and per design is meant to be
reused by a future level-up/level-down boon mechanic.

**Files touched:** `resources/boon/boon.js` (full rewrite), `gameplay/boon.js`
(`pickId`, `exemptFromOccurrenceCap`, `createActiveBoonEntry()`,
`grantBoonBypassingCap()`, `removeActiveBoon()`, exported `isBoonAvailable()`),
`gameplay/boon_effects.js` (every case now returns an appliedEffect record; new
`reverseBoonEffect()`; `pickRandomOtherGems()` now unlocked-gem-only), `gameplay/score.js`
(`frenzyAdjustmentFor()` now reads `pick.penalizedGems` instead of "every other gem"),
`main.js` (`showBoonDialog()`/`buyBoonFromShop()` now capture and attach `appliedEffect`).

---

## 4. Target score — milestone scaling

```
base(level)       = ROUND(1000 x 1.15^(level-1)) x level + 500 x 1.05^level
milestoneFactor    = 1.10 ^ FLOOR((level-1) / 5)
target(level)      = ROUND(base(level) x milestoneFactor x boonEffectState.targetScoreMultiplier)
```

`milestoneFactor` is a **step function** (FLOOR, not a fractional exponent) — flat at 1.0
for levels 1–5, jumps to a flat 1.10 for levels 6–10, 1.21 for 11–15, 1.331 for 16–20, etc.
Every level within one 5-level band scores identically; the whole +10% lands all at once on
the band's first level.

**Files touched:** `gameplay/progression.js` (`calculateScoreTarget()`).

---

## 5. Event system — foundation, Encounter, and Challenge

A brand-new run-time system: after every boon pick (and shop visit, if one opened), right
before the next level starts, there's a chance an event interrupts.

### Trigger ladder
`EVENT_CHANCE_LADDER = [0.05, 0.10, 0.20, 0.35, 0.55, 0.75]` (`resources/event/event.js`).
`eventState.chanceIndex` tracks how many consecutive level-ups have passed with no event;
advances by 1 (capped at the ladder's last entry) on a miss, resets to 0 the instant an
event actually fires. Resets on "start over" too.

### Type roll
Once an event is determined to fire, its TYPE is a weighted roll (Encounter 50% / Elite
20% / Challenge 30%, `EVENT_TYPE_WEIGHTS`), re-normalized over whichever types are
currently *eligible* (e.g. Encounter needs a valid trade candidate or `score > 0`;
Challenge needs at least one available Legendary boon in the pool). If the "does an event
fire" roll succeeds but literally nothing is eligible, it's treated as a miss for ramp
purposes (the ladder still advances) rather than getting stuck.

### Once-per-run tracking
`eventState.seenEventIds` — one shared list across ALL three event types (Encounter, Elite,
Challenge alike). An event's def id is marked seen the moment it's SHOWN (win/lose/
decline/flee all count) — it can never be offered again for the rest of that run. Resets
on "start over".

### Encounter — three differently-shaped entries
`ENCOUNTER_POOL` entries carry a `kind` field since they no longer share one shape:

- **`'trade'` — The Gem Mole.** Binary trade-or-decline. Trading reverses+removes a random
  held boon (via the Section 3 foundation) and grants a same-rarity replacement through the
  normal `isBoonAvailable()`-gated path.
- **`'gamble'` — Fortune's Folly.** Only eligible above 0 score. Bet a % of current score
  (10/25/50/75/100%), which is deducted immediately regardless of outcome. A 50/50 coin
  flip: win → the wager doubles into a "pot" (not yet credited to score) and loops into a
  Double-or-Nothing-or-cash-out choice, indefinitely; lose → the pot is gone, but — per
  design — **only the original wager is ever actually lost from score**, no matter how many
  Double-or-Nothing rounds preceded the loss. Cashing out credits the current pot to score.
  A "Pay 5% and leave" option skips the gamble entirely.
- **`'help_or_absorb'` — The Lost Miner.** Three-way choice: Help (+15% score, no boon —
  corrected from an earlier draft), Absorb (grants one normally-capped random boon AND
  applies a new curse), Leave (pure no-op).

### Curse foundation (minimal, real, reversible)
A curse is NOT yet its own system — this is deliberately the smallest real foundation for
one. New `resources/curse/curse_state.js` (`curseState.activeCurses`, separate from
`boonState` on purpose, so a future dedicated curse UI/removal system has its own list to
grow into) and `resources/curse/curse.js` (`CURSE_POOL`, currently one entry: "Weight of
Greed" — +10% target score, permanent, starting next level). Its `effect` is shaped
EXACTLY like a boon's `global_score_boost` kind, so `applyBoonEffect()`/`reverseBoonEffect()`
handle it with zero new dispatcher code. `gameplay/curse.js` mirrors `boon.js`'s
`pickBoon()`/`removeActiveBoon()` pattern (`grantCurse()`/`removeActiveCurse()`).

### Challenge — no-detonation
Single entry ("The Silent Vein"): accept-or-decline, then clear the level without any
special gem detonating (a passive Laser/Discharger blast OR any of the 7 swap-activated
combos — both count). Detonating fails the challenge **immediately** (banner updates to
reflect it) but the player still has to clear the level normally; only the Legendary reward
is withheld. `markChallengeDetonation()` is called from `finishSwapActivatedCombo()`
(covers all 7 combos) and from `resolveMatches()` whenever `incidentalCells.length > 0`
(covers a passive blast).

### Objective banner
New `#objective-banner` element, shown/hidden by `main.js`'s `updateObjectiveBanner()`,
ticking once a second via `startObjectiveTicker()` so an Elite countdown stays live
regardless of what else is happening. Hidden entirely when no modifier is active.

### Event dialog
One shared `#event-dialog` element for all event types — `main.js` swaps title/story/
choices per event rather than using separate markup per type. Fortune's Folly's looping
flow (bet → win/lose → double-or-nothing-or-cash-out → repeat) is handled as a small chain
of dialog-rebuilding functions (`showFortunesFollyDialog` → `handleFollyInitialBet` →
`showFollyPostWin` → `handleFollyDoubleOrNothing`/`handleFollyCashOut`), not a generic
node-graph engine — kept simple since only one event currently needs branching at all.

**New files:** `resources/event/event_state.js`, `resources/event/event.js`,
`resources/curse/curse_state.js`, `resources/curse/curse.js`, `gameplay/event.js`,
`gameplay/curse.js`.
**Files touched:** `main.js` (imports, DOM refs, `attemptEvent()`, `proceedAfterBoonPick()`
hook, all event dialog builders, `init()` reset calls), `gameplay/boon_shop.js`
(`PLACEMENT_ONLY_KINDS` exported for reuse).

---

## 6. UI polish pass

- **Boon cards** (boon dialog): resized to a fixed 230x340 "trading card" rectangle
  (flex-grow description, footer rarity badge), 2px border colored per rarity via a new
  `.boon-card--<rarity>` class (`--rarity-common/uncommon/rare/epic/legendary` CSS
  variables; Legendary reuses `--gold`). Hover no longer overrides border color — a soft
  glow + lift communicates hover instead.
- **Shop cards**: same rarity-border treatment, resized to a fixed 160px width, and forced
  onto a single row (`flex-wrap: nowrap`, dialog widened to fit all 5).
- **Side-stats tooltip**: Global Multiplier/Global Bonus labels now have a dashed underline
  and a pure-CSS hover tooltip (`data-tooltip` attribute + `::after`, no JS) explaining what
  each stat means and when it's calculated.
- **Event dialog**: widened (max-width 620px, min-width 420px, larger padding), a scale+fade
  "pop in" entrance animation on every show (`@keyframes event-dialog-pop-in`), and
  `white-space: pre-line` so the `\n\n`-separated flavor-text paragraphs actually render as
  paragraph breaks. Choice buttons switched from `flex:1` (fine for 2) to wrap-friendly
  `flex:0 1 auto` with a min-width, since some events now offer up to 6 choices.

**Files touched:** `layout.css` (rarity CSS variables, tooltip rules), `dialog.css` (boon
card, shop card, event dialog rules), `main.js` (rarity class added to both card builders).

---

## 7. Elite subsystem — full rewrite

The original single-shape Elite (Gem Elitist: double target, beat a 3-minute clock, win 2
Epic boons / lose 1 random boon) was retired and replaced with three structurally different
fights, each declaring its own win-condition and outcome-effect via a generalized tagged-
union schema — this was a real engine rewrite, not just new pool data.

### Schema
Each `ELITE_POOL` entry now has:
- **`winCondition`** — `'time_race'` (beat a doubled target within a time limit) |
  `'gem_cap'` (don't clear more than N of one random gem type) | `'gem_subscore_race'`
  (earn a score threshold specifically from one random gem type before the level clears).
- **`onWin` / `onLose`** — `'grant_boons'` | `'lose_random_boons'` | `'target_percent'`
  (permanent, stacks into `boonEffectState.targetScoreMultiplier`) | `'score_percent'`
  (one-time, computed off live score at resolution time).
- **`decline`** — `'free'` | `'fixed_penalty'` | `'coinflip_penalty'` (50/50; only Gem
  Cultivator uses this).

`gameplay/event.js`'s `applyEliteOutcomeEffect()` is the single dispatcher for the
`onWin`/`onLose`/decline-penalty union (mirrors `boon_effects.js`'s `applyBoonEffect()`
pattern) — it returns `{ scoreDelta, grantedNames, removedNames }`, letting result text be
written as a function (e.g. `winText: (grantedNames) => ...`) that gets resolved at
resolution time via a small `resolveMaybeFn()` helper, so flavor text can name the actual
boons granted/lost instead of a generic placeholder.

### The three fights
- **Boon Hoarder** (`time_race`) — double target, 3-minute cap. Win: 3 Epic boons, exempt
  from `maxOccurrences` (same treatment Gem Elitist's reward had). Lose: 2 random boons
  lost. Decline ("Surrender"): 1 random boon lost, no fight at all.
- **Cultist's Ritual** (`gem_cap`, cap 30 of one random unlocked gem, matches AND
  incidental clears both count) — exceeding the cap does NOT end the fight early; only
  checked once the level actually clears. Win: target score **permanently** -20%. Lose:
  permanently +20%. Decline: permanently +10%, no fight.
- **Gem Cultivator** (`gem_subscore_race`, threshold = `FLOOR(0.25 x (thisLevelsTarget -
  scoreWhenFightAccepted))`, earned from one random unlocked gem) — Win/Lose: ±50% of
  current score, one-time, computed at the moment the level actually clears (not when the
  threshold was first reached). Decline ("Slip away"): 50/50 coinflip — success free,
  failure -25% of current score.

### Gem-activity tracking (new plumbing)
`gem_cap`/`gem_subscore_race` need to know, per cascade step, how many cells of the
tracked gem were cleared and how much score is attributable to that gem. Two new exports
in `gameplay/score.js`: `countGemClears()` (matched-group length + one per incidental cell,
filtered to one gemId) and `calculateGemAttributedScore()` (re-runs the scoring formula
filtered to one gemId, using the step's own combo multiplier and global multiplier, but
deliberately excluding the flat global bonus — documented as a reasonable approximation,
not a source of the player's actual score). `gameplay/event.js`'s
`recordEliteGemActivity(matchedGroups, incidentalCells, comboCount)` is called from BOTH
`main.js`'s `resolveMatches()` (normal match path) and `finishSwapActivatedCombo()` (all 7
swap-activated combos, which needed their `matchedGroups`/`incidentalCells` locals pulled
out into named variables so they could be threaded through) — safe to call unconditionally,
no-ops instantly if no Elite is active or the active one doesn't use gem-tracking.

### Objective banner
`getEliteProgressInfo()` returns a plain-data snapshot per win-condition kind; `main.js`'s
`updateObjectiveBanner()` formats it per kind (countdown for `time_race`; live count/cap,
with a "cap exceeded" variant, for `gem_cap`; live subscore/threshold for
`gem_subscore_race`).

**Files touched:** `resources/event/event_state.js` (new `activeEventState` fields:
`eliteGemId`, `eliteGemClearCount`, `eliteCapBreached`, `eliteGemSubscore`,
`eliteSubscoreThreshold`), `resources/event/event.js` (`ELITE_POOL` fully rewritten),
`gameplay/event.js` (Elite section fully rewritten: `startEliteFight()`,
`applyEliteOutcomeEffect()`, `declineElite()`, `resolveEliteOutcome()`,
`recordEliteGemActivity()`, `getEliteProgressInfo()`, `pickRandomUnlockedGemId()`,
`gemNameForId()`, `resolveMaybeFn()`), `gameplay/score.js` (`gemIdForType()` exported,
new `countGemClears()`/`calculateGemAttributedScore()`), `main.js`
(`showEliteDialog()` rewritten, `updateObjectiveBanner()`'s Elite branch rewritten,
`finishSwapActivatedCombo()` gained a `matchedGroups`/`incidentalCells` parameter pair
threaded through all 7 combo handlers, `resolveMatches()` and `applyScoreGain()` both
updated to call the new gem-tracking/outcome-resolution functions).

---

## Known gaps / flagged simplifications carried into this round

- **`calculateGemAttributedScore()`** is an approximation (see Section 7) — summing every
  gem's attributed score for a mixed-gem step won't exactly reconstruct that step's real
  total once the flat global bonus is involved. Acceptable since it only feeds a progress
  threshold, never the player's actual score.
- **Elite `time_race`'s target doubling is NOT permanent** — it mutates
  `progressionState.scoreTarget` directly and relies on `advanceLevel()` naturally
  overwriting it with a fresh value next level (no explicit "undo" exists or is needed).
  Only `target_percent` (Cultist's Ritual) goes through the permanent
  `targetScoreMultiplier` stack. Don't conflate the two mechanisms when adding a future
  Elite.
- **`curseState` is intentionally its own list**, not folded into `boonState`, even though
  today's one curse applies through the exact same `appliedEffect`/`reverseBoonEffect`
  machinery a boon uses. This is meant to be outgrown by a real curse system later (its own
  panel, its own removal mechanics) — don't merge the two lists as a "simplification."
- **Only one event modifier (Elite or Challenge) can be active at a time** — a natural
  consequence of the roll happening once per level-up. Not currently enforced by a guard
  anywhere; just structurally true given the trigger point.
- **Event reward pools (Elite win rewards, Challenge win reward) exclude locked-gem boons
  and board-shape boons** — same `candidatePoolForRarity()` filter used everywhere in
  `gameplay/event.js`. Board-shape boons remain fully removed from `BOON_POOL` regardless
  (see Part 4 §22) — this filter is currently redundant for that case but harmless to keep.