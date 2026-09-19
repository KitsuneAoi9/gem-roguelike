# Handoff — Browser Match-3 Game

## 1. Project Overview

A browser-based match-3 game built with **JavaScript / HTML / CSS**.

- **Build:** No build step.
- **Run:** Load `index.html` through a local HTTP server. See [Gotchas](#19-gotchas).
- **Current focus:** Boon effects (now implemented — full 114-entry pool) and shop integration.
- **Architecture priority:** Keep game data/state separate from gameplay logic, keep `main.js` thin, and keep `board.js` independent of rendering and special-gem rules.

---

## 2. Current State at a Glance

### Completed

- Start screen and game-start gating
- Core match-3 loop
- Swap and selection animations
- Level progression
- Board construction/deconstruction plumbing
- Flame, Star, and Hypercube special gems
- Deadlock prevention
- Lose/restart flow
- Level-up handling
- Multi-level progression
- Base score/multiplier data, split into a fixed default (`base_score.js`) + mutable per-gem state (`gem_base_state.js`)
- Moves-left loss condition shelved behind a flag (not removed)
- File/folder naming convention standardized (Rule 10)
- **Full boon system:** 114-entry pool (110 per-gem + 4 global), rarity-weighted offers, gem-unlock gating, and all effects wired into a redesigned scoring pipeline
- **Global score bonus mechanic** (multiplier + flat bonus, applied once per cascade step)
- **Target score multiplier** (stacks multiplicatively off the 4 global boons' `%` clauses)

### In Progress

- **Shop:** data model and purchase logic are implemented; `main.js` integration and dialog UI are not.
- **Tile boons** (`TILE_BASIC`/`TILE_EXPANDED`): enum values kept, but the old placeholder tile-boon entries were removed from `BOON_POOL` per the new design sheet. A follow-up list is expected.

### Not Started / Future

- Dedicated special-gem artwork
- RPG systems (including the actual research/unlock system for locked gems)
- Additional gem artwork: Onyx, Aquamarine, Bloodstone, Pearl
- Shop dialog/integration
- Actual effects for constructed bonus tiles / TILE_BASIC / TILE_EXPANDED boons
- Special-gem + special-gem combinations
- Hypercube-aware deadlock detection
- Higher ascension/difficulty mode that re-enables the moves-left loss condition
- Luck stat (would adjust `BOON_RARITY_WEIGHTS`, not replace it)

---

# 3. Architecture Rules

### Rule 1 — Comment density follows complexity

Simple code gets light comments. More comments are expected around complicated behavior (match detection, cascade resolution, swap animation, special-gem shape detection, the scoring pipeline, boon effect dispatch).

**Inline comments (inside a function body) stay short, precise, and only cover important info** — a single line noting *why*, not a paragraph. JSDoc above a function can still be thorough.

### Rule 2 — `board.js` is pure grid logic

`board.js` must not know about the DOM, scoring, or special gems. It operates on a grid of numbers and knows what is legal. It also provides generic parallel-grid shifting in `collapseAndFill()` without knowing what those grids represent.

### Rule 3 — `render.js` owns board DOM access

`render.js` is the only file allowed to touch the board DOM, so it can eventually be swapped for a Phaser renderer without touching `board.js`/`main.js`.

### Rule 4 — Keep `main.js` thin

`main.js` owns game state and decides **when** things happen. Complicated logic belongs in `board.js` or a dedicated module — see `boon_effects.js` and `gem_base.js` as recent examples of pulling logic out of `main.js` rather than growing it there.

### Rule 5 — One concern per module

New concerns get their own file. Examples: `score.js` vs `board.js`; `tiles.js` + `tile_state.js`; `special_gems.js` + `special_gem_state.js` + `special_gem.js`; **`boon.js` (offer generation/picking) vs `boon_effects.js` (applying a picked boon's effect) vs `gem_base.js` (reading/writing per-gem base values)**.

### Rule 6 — `js/resources/` contains data/state only

`js/resources/` contains constructors, constants, and field variables — **no functions**. All methods/functions live under `js/gameplay/`.

**Exception, added this round:** a resource file MAY import data from another resource file (e.g. `resources/boon/boon.js` imports `ALL_GEM_CATALOG` from `resources/constant/constants.js` to build the per-gem boon pool from one source of truth instead of duplicating the gem list). This is still "no functions exported from resources" — it's about the *export surface*, not the import graph.

### Rule 7 — Separate numbers from words

- Fixed game-mechanic values → `constants.js`
- Fixed scoring default values → `base value/base_score.js`
- Fixed user-facing wording → `text.js`
- Strings with interpolated values → stay as template literals in `main.js`

### Rule 8 — Boon tiles and board tiles use the same concept

`TILE_BASIC`/`TILE_EXPANDED` boon types (enum values kept, pool entries removed pending a follow-up list) should route through `tiles.js` → `constructTile()` rather than a second placement path, once implemented.

### Rule 9 — Special gems are a metadata overlay

The main grid never contains a special-gem type; that lives in `specialGemState.grid`, kept in sync via the established swap/collapse pattern.

### Rule 10 — File/folder naming convention

- **Files** with more than one word use `snake_case` — e.g. `special_gems.js`, `gem_base_state.js`.
- **Folders** with more than one word use a literal space — e.g. `special gem`, `base value`.
- Single-word names (`board.js`, `boon`, `gem`) are unaffected.
- Import paths into space-named folders must percent-encode the space as `%20` — see [Gotchas](#19-gotchas).

### Rule 11 — Boon effects are data-driven, dispatched by `effect.kind`

Every `BOON_POOL` entry's `effect` object has a `kind` field (`'gem_score_delta'`, `'gem_multiplier_delta'`, `'gem_score_lust'`, `'gem_multiplier_maniac'`, `'affinity'`, `'frenzy'`, `'global_score_boost'`). `js/gameplay/boon_effects.js`'s `applyBoonEffect()` is the single place that switches on `effect.kind` and mutates the right state bucket. Do not add ad-hoc per-boon-id branching anywhere else — a new effect *shape* gets a new `kind` and a new `case` in that one switch.

---

# 4. File Layout

## Project Tree

```text
Game/
└── gem-match/
    ├── index.html
    │
    ├── css/  (unchanged — see prior handoff sections for detail)
    │
    └── js/
        ├── resources/
        │   ├── constant/
        │   │   ├── constants.js         (gem defs now carry `id`; adds ALL_GEM_CATALOG/ALL_GEM_IDS)
        │   │   └── text.js
        │   │
        │   ├── base value/
        │   │   ├── base_score.js        (defaults renamed DEFAULT_GEM_BASE_SCORE/MULTIPLIER; 60/125 fix)
        │   │   └── gem_base_state.js    (NEW — mutable per-gem-id score/multiplier deltas)
        │   │
        │   ├── progression/
        │   │   └── progression.js
        │   │
        │   ├── boon/
        │   │   ├── boon.js              (rewritten — full 114-entry BOON_POOL, generated from a gem roster)
        │   │   ├── boon_state.js
        │   │   └── boon_effect_state.js (NEW — affinity/frenzy/global-score/target-multiplier state)
        │   │
        │   ├── gem/                      (NEW folder — single word, no space needed)
        │   │   └── gem_unlock_state.js   (NEW — per-gem unlocked flag; meta-progression, not run-scoped)
        │   │
        │   ├── shop/
        │   │   ├── shop.js
        │   │   └── shop_state.js
        │   │
        │   ├── tile/
        │   │   └── tile_state.js
        │   │
        │   └── special gem/
        │       ├── special_gem.js
        │       └── special_gem_state.js
        │
        └── gameplay/
            ├── board.js
            ├── render.js
            ├── score.js                 (rewritten — full scoring pipeline, see Section 8)
            ├── progression.js           (calculateScoreTarget now applies targetScoreMultiplier)
            ├── boon.js                  (rewritten — rarity-weighted offer generation + gem-unlock gating)
            ├── boon_effects.js          (NEW — applyBoonEffect()/resetBoonEffects())
            ├── gem_base.js              (NEW — getGemBaseScore/Multiplier/Value(), resetGemBaseState())
            ├── shop.js
            ├── tiles.js
            ├── special_gems.js          (resolveSpecialGems() now also returns matchedGroups/incidentalCells)
            └── main.js                  (updated: init() ordering, new score calls, boon-pick wiring)
```

## CSS Details

Unchanged from prior handoffs — see `css/model/`, `css/design/`, `css/animation/`.

---

# 5. JavaScript Module Responsibilities

## `js/resources/`

Data and state only. No functions (see Rule 6's import exception).

| File | Responsibility |
|---|---|
| `constant/constants.js` | Fixed game-mechanic values, feature flags, gem catalog (now with `id`, plus `ALL_GEM_CATALOG`/`ALL_GEM_IDS`) |
| `constant/text.js` | Fixed user-facing strings |
| `base value/base_score.js` | Default gem base score/multiplier, match-size multiplier table, cascade multiplier curve |
| `base value/gem_base_state.js` | **NEW** — mutable per-gem-id `{ scoreBonus, multiplierBonus }` deltas |
| `progression/progression.js` | Mutable per-level state |
| `boon/boon.js` | Fixed boon catalog — 110 per-gem boons (generated) + 4 global boons |
| `boon/boon_state.js` | Mutable per-run active-boon list |
| `boon/boon_effect_state.js` | **NEW** — mutable affinity/frenzy/global-score/target-multiplier state |
| `gem/gem_unlock_state.js` | **NEW** — per-gem unlocked flag (meta-progression, NOT reset per run) |
| `shop/shop.js` | Fixed shop item pool/settings |
| `shop/shop_state.js` | Mutable per-run shop state |
| `tile/tile_state.js` | Mutable tile state |
| `special gem/special_gem.js` | Fixed special-gem catalog |
| `special gem/special_gem_state.js` | Mutable special-gem overlay |

### `constant/constants.js`

Each `GEM_DEFINITIONS`/`FUTURE_GEM_DEFINITIONS` entry now carries an `id` (lowercase string, e.g. `'amethyst'`) alongside `name`/`file`. This `id` is the key used everywhere a gem needs to be referenced outside the board's numeric type index: `BOON_POOL` entries, `gemBaseState.perGem`, `gemUnlockState.unlocked`.

`ALL_GEM_CATALOG` = `[...GEM_DEFINITIONS, ...FUTURE_GEM_DEFINITIONS]` (11 gems). `ALL_GEM_IDS` = those ids. Both exist so locked/future gems can still participate in gem-keyed state (base value deltas, unlock flags) before they're wired into the actual board.

### `base value/base_score.js`

`DEFAULT_GEM_BASE_SCORE`/`DEFAULT_GEM_BASE_MULTIPLIER` (renamed from `BASE_GEM_SCORE`/`BASE_GEM_MULTIPLIER`) are now explicitly the *starting point* every gem's real base value is computed from — not a flat global constant used directly in scoring anymore. `MATCH_BASE_SCORE` corrected to `{3: 30, 4: 60, 5: 125}` per the corrected design sheet.

### `base value/gem_base_state.js`

`gemBaseState.perGem[gemId] = { scoreBonus, multiplierBonus }`. Deltas only — the actual value is always `DEFAULT + delta`, computed by `gameplay/gem_base.js`. Seeded for all 11 gem ids (including locked ones) by `resetGemBaseState()` so Lust/Maniac penalties can land on a gem before it's unlocked.

### `boon/boon.js`

`BOON_POOL` is generated, not hand-written: a `GEM_ARCHETYPES` template array (Affinity/Frenzy/Bounty/Brilliance/Lust/Carat/Enthusiast/Addict/Maniac/Fanatic) is cross-joined with `ALL_GEM_CATALOG` (11 gems) to produce 110 entries, plus 4 hand-written global boons (Gemstone Gamble, Trinket Wager, Gem Greed, Jewel Avarice). Also exports `BOON_RARITY_WEIGHTS` (`{ common: 0.60, rare: 0.28, epic: 0.10, legendary: 0.02 }`).

Two ID collisions from the original design-sheet draft were fixed: `bloodstone_affinity`/`pearl_affinity` were reused for what were clearly the Frenzy rows — corrected to `bloodstone_frenzy`/`pearl_frenzy`.

### `boon/boon_effect_state.js`

```js
boonEffectState = {
  affinityBonus: {},          // gemId -> cumulative flat per-match bonus
  frenzyPicks: [],            // { gemId, bonus, penalty }[]
  globalScoreMultiplier: 1.0, // additive stacking
  globalScoreBonus: 0,        // additive stacking
  targetScoreMultiplier: 1.0, // multiplicative stacking
}
```

Reset every "start over" via `boon_effects.js`'s `resetBoonEffects()`.

### `gem/gem_unlock_state.js`

`gemUnlockState.unlocked[gemId]` — `true` for the 7 active gems, `false` for the 4 future gems. **Deliberately NOT reset on "start over"** — this is meta-progression (a stand-in for a future research/tech-tree system), unlike everything else boon-related, which is run-scoped. There is currently no in-game way to flip these to `true`; that's intentionally a future-system stub.

---

# 6. Gameplay Module Responsibilities

(Unchanged sections — `board.js`, `render.js`, `tiles.js`, `shop.js` — omitted here; see prior handoff content, nothing about them changed this round.)

## `score.js` (rewritten)

Owns the full scoring pipeline for one cascade step — see [Section 8](#8-scoring-pipeline) for the walkthrough. Reads gem values via `gem_base.js` and boon-driven adjustments via `boonEffectState`. No DOM, no grid ownership.

## `progression.js`

`calculateScoreTarget(level)` now multiplies the base curve by `boonEffectState.targetScoreMultiplier` before returning — so every call (initial reset, `advanceLevel()`, and the immediate re-derive `boon_effects.js` triggers on a global-boost pick) automatically reflects whatever target-multiplier boons have been picked so far.

## `boon.js` (gameplay)

`generateBoonOffer()` is now rarity-weighted (rolls a rarity per slot off `BOON_RARITY_WEIGHTS`, then picks randomly within that rarity; tops up uniformly if a roll comes up empty) and filters out any gem-scoped boon whose gem isn't unlocked (`gemUnlockState`). `pickBoon()` unchanged — it only records the pick in `boonState`; it does **not** apply the effect.

## `boon_effects.js` (NEW)

`applyBoonEffect(def)` — the single dispatcher (see Rule 11) that mutates `gemBaseState` / `boonEffectState` / `progressionState.scoreTarget` based on a picked boon's `effect.kind`. `resetBoonEffects()` — resets all boon-driven state for a fresh run (calls `gem_base.js`'s `resetGemBaseState()` internally, plus resets `boonEffectState`'s own fields).

## `gem_base.js` (NEW)

`getGemBaseScore(gemId)` / `getGemBaseMultiplier(gemId)` / `getGemBaseValue(gemId)` — the only place `DEFAULT_GEM_BASE_SCORE + delta` math happens. `resetGemBaseState()` — seeds `gemBaseState.perGem` with a zeroed delta for every gem id in `ALL_GEM_IDS` (active and locked).

## `special_gems.js`

`resolveSpecialGems()` now also returns:
- `matchedGroups: { gemType, length }[]` — each formed match group, with its **original** length (before a spawn cell is carved out of it)
- `incidentalCells: { gemType, row, col }[]` — cells cleared via chain-reaction blast, NOT part of a formed match this pass

Both feed directly into `score.js`'s `calculateCascadeStepScore()`.

## `main.js`

Unchanged responsibilities; new wiring:
- `init()` now calls `resetBoonEffects()` **before** `resetProgression(1)` (ordering matters — see Gotchas).
- `attemptSwap()`'s Hypercube branch and `resolveMatches()` both call `calculateCascadeStepScore()` instead of the old `calculateMatchScore()`.
- `showBoonDialog()`'s card click handler now calls `applyBoonEffect(def)` right after `pickBoon(def.id)`, and refreshes `targetEl.textContent` in case the pick changed the target score.
- A small `signed()` helper formats score deltas so negative combo/hypercube messages read as `-50` rather than `+-50`.

---

# 7. Game Flow / Systems

(Start screen, score targets/progression mechanics unchanged — see prior handoff sections. Level-up handling still shared between the normal-match and Hypercube paths via `applyScoreGain()`.)

---

# 8. Scoring Pipeline

This is the core mechanic reworked this round. Full pipeline, run once per cascade step (`resolveMatches()` pass, or a single Hypercube activation):

```text
1. For each matched group (a formed match, e.g. a match-3/4/5+):
     groupScore = gemBaseValue(gem) x groupLength x matchSizeMultiplier(groupLength)
   matchSizeMultiplier is MATCH_BASE_MULTIPLIER[3|4|5] — any length >=5 uses the 5 entry.
   gemBaseValue(gem) = getGemBaseScore(gem) x getGemBaseMultiplier(gem) — i.e. the
   gem's CURRENT (boon-adjusted) base score/multiplier, not the fixed defaults.

2. For each incidental cell (cleared via an existing special gem's
   blast chain, not part of a formed match this pass):
     incidentalScore = gemBaseValue(gem)   — one flat "Gem" row, no size multiplier

3. rawScore = sum of all group scores + all incidental scores

4. comboScaled = rawScore x getComboMultiplier(comboCount)
   (unchanged cascade curve: 1.0 + (comboCount-1) x 0.5)

5. afterFlatBonuses = comboScaled
                       + sum(Affinity bonus per matched group's gem)
                       + sum(Frenzy bonus/penalty per matched group's gem)
   Frenzy: matching the Frenzy's target gem adds its bonus (+100);
   matching any OTHER gem adds its penalty (-5). Every active Frenzy
   pick contributes independently — picking two different Frenzies
   means two penalties apply to a third, unrelated gem's match.

6. finalScore = afterFlatBonuses x globalScoreMultiplier + globalScoreBonus
   Multiplier is ALWAYS applied before the flat bonus is added.

7. return Math.round(finalScore)   — negative results are allowed, see Gotchas
```

### What can change what

| Boon archetype | Mutates | Kind | Scope |
|---|---|---|---|
| Affinity | `boonEffectState.affinityBonus[gem]` | `affinity` | per-match flat bonus, one gem |
| Frenzy | `boonEffectState.frenzyPicks[]` | `frenzy` | per-match flat bonus/penalty, one gem vs. everyone else |
| Bounty / Brilliance / Carat | `gemBaseState.perGem[gem].scoreBonus` | `gem_score_delta` | permanent base-value change, one gem |
| Lust | `gemBaseState.perGem[*].scoreBonus` | `gem_score_lust` | permanent, +to one gem, -to every other gem (including locked ones) |
| Enthusiast / Addict / Fanatic | `gemBaseState.perGem[gem].multiplierBonus` | `gem_multiplier_delta` | permanent base-value change, one gem |
| Maniac | `gemBaseState.perGem[*].multiplierBonus` | `gem_multiplier_maniac` | permanent, +to one gem, -to every other gem |
| Gemstone Gamble / Trinket Wager / Gem Greed / Jewel Avarice | `boonEffectState.globalScoreMultiplier`/`globalScoreBonus`/`targetScoreMultiplier` | `global_score_boost` | once per cascade step, applies to the WHOLE step's total |

### Base-value change vs. per-match bonus — why they're not the same

Bounty/Brilliance/Carat/Lust/Enthusiast/Addict/Fanatic/Maniac permanently change the number every future match of that gem is calculated FROM (it's inside the `gemBaseValue x length x sizeMultiplier` multiplication). Affinity/Frenzy are flat amounts added AFTER that calculation, once per match. Worked example (Amethyst Affinity vs. Amethyst Bounty, no other boons):

- No boons: match-3 = 10x3x1.0 = 30. Match-4 = 10x4x1.5 = 60.
- **Affinity only** (+50 flat): match-3 = 30 + 50 = 80. Match-4 = 60 + 50 = 110.
- **Bounty only** (+25 to base score, so gem base value becomes 35x1.0=35): match-3 = 35x3x1.0 = 105. Match-4 = 35x4x1.5 = 210.

### Hypercube activation

Treated as one oversized `matchedGroup` (`{ gemType: targetGemType, length: clearedCells.length }`), `comboCount: 1`, no incidental cells. Since a Hypercube always clears well past 5 cells, this always lands on the 5-tier multiplier — consistent with "apply match-5 calculation whenever you match 5 or more."

### Known simplification / TODO

Frenzy and Affinity are applied per **matched group**, not per incidental cell — a chain-reaction blast that incidentally clears a Frenzy/Affinity gem's cells does NOT get the bonus/penalty (only a genuinely formed match of that gem does). This was a design choice for this pass, not explicitly confirmed — flag if that's wrong and it can be moved into the incidental-cell loop too.

---

# 9. Moves-Left Mechanic (Shelved)

Unchanged from the prior handoff — see `ENABLE_MOVES_LIMIT` in `constants.js`, checked in `main.js`'s `checkEndState()`. Still fully dormant-but-present, not deleted.

---

# 10. Boon System (Full Implementation)

## Pool composition

**110 per-gem boons** = 11 gems (7 active + 4 locked) x 10 archetypes:

| Archetype | Effect | Type | Rarity | Max picks |
|---|---|---|---|---|
| Affinity | +50 flat score per match of this gem | BUFF | COMMON | 5 |
| Frenzy | +100 on this gem's match, -5 on every other match | RISKY_BUFF | RARE | Unlimited |
| Bounty | +25 to this gem's base score | BUFF | COMMON | Unlimited |
| Brilliance | +50 to this gem's base score | BUFF | RARE | Unlimited |
| Lust | +150 to this gem's base score, -10 to every other gem's | BUFF | COMMON | Unlimited |
| Carat | +250 to this gem's base score | BUFF | EPIC | 5 |
| Enthusiast | +0.5 to this gem's base multiplier | BUFF | COMMON | Unlimited |
| Addict | +1.0 to this gem's base multiplier | BUFF | RARE | Unlimited |
| Maniac | +2.0 to this gem's base multiplier, -0.5 to every other gem's | BUFF | COMMON | Unlimited |
| Fanatic | +5.0 to this gem's base multiplier | BUFF | EPIC | 5 |

**4 global boons** (not gem-scoped):

| Boon | Global multiplier | Global bonus | Target score |
|---|---|---|---|
| Gemstone Gamble | — | +50 (additive) | +5% (multiplicative) |
| Trinket Wager | — | +150 (additive) | +15% (multiplicative) |
| Gem Greed | +1 (additive) | — | +50% (multiplicative) |
| Jewel Avarice | +4 (additive) | — | +150% (multiplicative) |

All four are `RISKY_BUFF` / `RARE` / max 10 picks. "Gemstone"/"Trinket" in their names/flavor text are just naming — there's no gem-category taxonomy backing them.

**Stacking rule, general:** any flat number stacks additively; any `%` stacks multiplicatively. This governs both the global boons above and is the general convention for any future boon of this shape.

## Rarity odds

`BOON_RARITY_WEIGHTS` in `resources/boon/boon.js`: Common 60% / Rare 28% / Epic 10% / Legendary 2%. No boon currently uses `LEGENDARY` (reserved). Not yet adjusted by a Luck stat — that's future work, and would adjust these weights rather than replace the mechanism.

## Gem locking

Onyx/Aquamarine/Bloodstone/Pearl's boons are excluded from offers via `gemUnlockState.unlocked[gemId] === false` (checked in `boon.js`'s `isBoonAvailable()`). No boon needs a separate "locked" field — the gating reads directly off `effect.gem`. There is currently **no way to unlock these in-game** — `gemUnlockState` is a stub for a future research/tech-tree system, and (unlike everything else boon-related) is **not** reset on "start over" since it's meta-progression.

## Run-scoped vs. meta-progression

Everything under `boonState`/`boonEffectState`/`gemBaseState` resets to defaults every "start over" (run-scoped). `gemUnlockState` does not (meta-progression) — this is the one exception in the boon-adjacent state.

## Tile boons

`BOON_TYPE.TILE_BASIC`/`TILE_EXPANDED`/`CURSE` enum values are retained but currently unused — the old placeholder tile-boon pool entries (`anchor_tile`, `corner_stash`, `expansive_vein`, `long_seam`) were removed per this round's instructions. A follow-up tile-boon list is expected in a future session; when it arrives, route its effects through `tiles.js` → `constructTile()` per Rule 8, and give it its own `effect.kind` values dispatched in `boon_effects.js` per Rule 11.

---

# 11. Shop System

Unchanged from the prior handoff — data model and purchase logic implemented, not wired into `main.js`, no dialog UI yet.

---

# 12. Board Construction & Deconstruction

Unchanged from the prior handoff.

---

# 13. Special Gems

Unchanged mechanically from the prior handoff (Flame/Star/Hypercube spawn rules, chain reactions). The one change: `resolveSpecialGems()`'s return shape grew two new fields (`matchedGroups`, `incidentalCells`) purely for scoring — see [Section 8](#8-scoring-pipeline) and [Section 6](#6-gameplay-module-responsibilities).

---

# 14. Gravity and Parallel Grids

Unchanged from the prior handoff.

---

# 15. Rendering Special Gems

Unchanged from the prior handoff.

---

# 16. Lose Condition

Unchanged from the prior handoff (still gated by `ENABLE_MOVES_LIMIT`).

---

# 17. Feature Status

| Feature | Status |
|---|---|
| Start screen / Start Game gating | Done |
| Core match-3 loop | Done |
| Combo / score system | **Done** — full redesigned pipeline (per-gem base value, match-size table, Affinity/Frenzy, global multiplier+bonus) |
| Boon system | **Done** — 114-entry pool, rarity-weighted offers, gem-unlock gating, all effects wired |
| Global score bonus | **Done** — multiplier + flat bonus, applied once per cascade step |
| Target score scaling | **Done** — multiplicative stacking off global boons' `%` clauses |
| Gem-locking (Onyx etc.) | **Done as a stub** — flag + filtering only, no unlock mechanism yet |
| Selection / swap animation | Done |
| Board construction / bonus tiles | Plumbing done; no effect reads the tile list yet |
| Board deconstruction / blocked cells | Done |
| Flame / Star / Hypercube special gems | Done — Hypercube now scores through the same pipeline as a normal match |
| Special-gem artwork | Not started |
| RPG systems (incl. real gem-unlock/research) | Not started |
| Moves-left loss condition | Shelved behind `ENABLE_MOVES_LIMIT` |
| Deadlock prevention | Done — doesn't account for Hypercube |
| Lose dialog + restart | Done |
| Level indicator / level-up | Done |
| Multi-level progression | Done — no cap yet |
| Shop | In progress — not wired to `main.js`, no dialog UI |
| Tile boons | Removed pending a follow-up list |
| File/folder naming convention | Done |

---

# 18. Known Gaps / TODOs

## High-Priority Current Work

### Shop integration

Implement the shop opening flow in `main.js`, the shop dialog UI, and actual in-game integration of purchases.

### Tile boons (follow-up list expected)

When the new tile-boon list arrives: give each entry an `effect.kind`, add the matching `case` to `boon_effects.js`'s `applyBoonEffect()`, and route actual placement through `tiles.js` → `constructTile()`.

### Frenzy/Affinity + incidental cells (flagged, not yet resolved)

Currently Frenzy/Affinity only apply to formed matches, not to incidental blast-chain cells of the same gem. Confirm whether that's the intended behavior; if not, extend the incidental-cell loop in `score.js`.

## Existing TODOs

- Deconstructing part of an installed tile should remove/adjust the affected `tileState.installedTiles` entry.
- `hasPossibleMove()` should eventually account for Hypercube activation.
- Special-gem + special-gem combinations are not implemented.
- Dedicated special-gem artwork is not implemented.
- Additional gem SVGs (Onyx/Aquamarine/Bloodstone/Pearl) are not implemented — they exist only as boon-system data right now.
- RPG systems, including the real gem-unlock/research system, are not implemented.
- The higher ascension/difficulty mode that flips `ENABLE_MOVES_LIMIT` back on is not designed yet.
- Luck stat (would adjust `BOON_RARITY_WEIGHTS`) is not implemented.

---

# 19. Gotchas

(All gotchas from the prior handoff still apply — run over HTTP, animation timing duplication, gem SVG location, `resources/` location, data/logic split, `%20` for space-folder imports, `boon.js`/`special_gem.js` naming collisions, moves-left flag, `busy` state spanning dialogs, `BLOCKED` vs `-1`, special-gem overlay sync, Hypercube bypassing `findMatches()`, placement-mode click interception. New ones below.)

### Negative score is allowed, on purpose

The scoring pipeline does **not** clamp to zero anywhere. It's expected/acceptable for a heavy Frenzy/Lust/Maniac build to drive the running score negative mid-run — balancing that is the player's problem, not something the engine prevents. Don't add a `Math.max(0, ...)` guard anywhere in `score.js` or `applyScoreGain()`.

### `resetBoonEffects()` must run before `resetProgression()`

`main.js`'s `init()` calls `resetBoonEffects()` first, then `resetProgression(1)`. This order matters: `calculateScoreTarget()` (progression.js) reads `boonEffectState.targetScoreMultiplier`, so it needs to already be back at `1.0` before level 1's target is computed on a fresh run. Reordering this will silently carry over a stale multiplier from the previous run into a "fresh" game.

### `gemUnlockState` is the one boon-adjacent resource that does NOT reset

Every other boon-related mutable resource (`boonState`, `boonEffectState`, `gemBaseState`) is wiped on every "start over." `gemUnlockState` is deliberately left alone — it's meant to represent persistent meta-progression (a future tech tree), not something a run resets. Don't add it to `init()`'s reset calls without discussing it first — that would defeat its purpose.

### `effect.gem` doubles as the gem-unlock gate

There's no separate `locked: true` field on a boon. `boon.js`'s `isBoonAvailable()` gates a boon purely off `effect.gem` existing and `gemUnlockState.unlocked[effect.gem]` being false. If a future boon needs to be gem-scoped WITHOUT being locked/unlocked (e.g. always-available regardless of research), don't just add `effect.gem` — that field is overloaded to mean "and also gate on unlock status."

### `matchedGroups` uses the ORIGINAL match length, not the post-spawn cleared count

When a match-4 spawns a Flame gem, one of those 4 cells survives (as the Flame) rather than being cleared. `resolveSpecialGems()`'s `matchedGroups` still reports `length: 4` for that group — scoring uses the full match size, not "how many cells actually got removed." Don't "fix" this by using `clearedCells.length` instead; that would under-score every match that spawns a special.

### Two-step gem lookup: numeric `gemType` (board) vs. string `gemId` (boon/base-value systems)

The board grid, `findMatches()`, `resolveSpecialGems()` etc. all use the numeric index into `GEM_DEFINITIONS` (`gemType`). Everything boon/base-value related (`gemBaseState`, `boonEffectState.affinityBonus`, `gemUnlockState`, `BOON_POOL` entries) uses the lowercase string `id`. `score.js`'s `gemIdForType()` is the only conversion point — new code that needs both should go through it rather than re-deriving the id another way (e.g. from a gem's display `name`).

### Resource-to-resource import (new exception to Rule 6)

`resources/boon/boon.js` imports `ALL_GEM_CATALOG` from `resources/constant/constants.js`. This is intentional (see Rule 6) — don't "fix" it by duplicating the gem list into `boon.js` as a literal array. If you add another resource file that needs the gem roster, import `ALL_GEM_CATALOG`/`ALL_GEM_IDS` from `constants.js` rather than hand-copying it again.

### `applyBoonEffect()` must be called separately from `pickBoon()`

`pickBoon()` (boon.js) only records a pick in `boonState.activeBoons` — it does not touch `gemBaseState` or `boonEffectState`. `main.js`'s `showBoonDialog()` card click handler calls both `pickBoon(def.id)` and `applyBoonEffect(def)` back to back. If you add another place that picks a boon (e.g. a debug/dev tool), remember both calls — picking without applying silently does nothing, and applying without picking breaks `maxOccurrences` cap tracking (which reads `boonState.activeBoons`).
