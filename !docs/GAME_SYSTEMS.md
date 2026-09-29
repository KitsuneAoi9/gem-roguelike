# GAME_SYSTEMS --- Current Match-3 Systems

## 1. Board and matching

### Board model

-   Physical allocation: `MAX_BOARD_SIZE = 20×20`.
-   Initial usable area: `INITIAL_BOARD_SIZE = 8×8`.
-   Unusable cells are represented by `BLOCKED`.
-   Rendering crops to the current active bounds rather than showing the
    whole 20×20 allocation.
-   Expansion uses temporary ghost cells adjacent to usable cells.
-   Expand/shrink placement code still exists, but its boon entries are
    currently removed from the active pool.

### Normal matching

-   Standard color matches resolve into cascades.
-   Special gems live as a metadata overlay; their underlying gem color
    remains in `grid`.
-   Gravity/collapse operates on the grid and parallel special-gem
    state.
-   Deadlock detection considers special-gem swaps as legal moves where
    appropriate.

## 2. Special gems

### Laser
A straight match-4 creates a directional Laser:
- horizontal match → row Laser
- vertical match → column Laser

Laser blast helpers are shared with consumables.

### Discharger
A genuine L/T-shaped match creates a Discharger.

Its normal passive blast is a **diamond with Manhattan radius 2**, not a 3×3 square.

A solid block or zigzag that merely happens to be a non-straight 4+ group does **not** create a Discharger (`findLTIntersection()` rejects it).

### Hyperstar
A straight match of 5+ creates a Hyperstar. It is swap-activated only.

### Swap-activated combos

| Swap | Behavior |
|---|---|
| Hyperstar + plain gem | Wipe all gems of the target color (Frantic Star adds a second random color) |
| Hyperstar + Laser | Convert the target color into Lasers (random orientation) and detonate all |
| Hyperstar + Discharger | Convert the target color into Dischargers and detonate all |
| Hyperstar + Hyperstar | Clear the whole board |
| Laser + Laser | Full row AND full column through the swap's destination cell |
| Discharger + Laser | 3 full rows or 3 full columns (matching the laser's orientation), centered on the Discharger |
| Discharger + Discharger | Row + column + both diagonals burst from the destination cell |

Every one of these combos is a legal move for deadlock/hint detection (`isSpecialSwapPair()`).

### Chain reactions
A special gem caught inside any clearing area fires its own effect:
- Laser/Discharger → its own blast shape
- Hyperstar → wipes one random gem color
- Obsidian and BLOCKED cells are never destroyed (`isDestroyable()`)

Chain-reaction expansion is implemented in **three** places: `resolveSpecialGems()`'s BFS (normal matches), `expandConsumableBlast()` (consumables), and `expandChainReaction()` (all swap-activated combos and Frantic Star's self-activation).

For swap combos, `main.js` keeps a module-level `currentSwapKeys` set (the two swapped cells). It is passed as `skipKeys`, so a special that just activated via the swap does not fire a second time. The chain-reaction extras score as flat incidental cells.

`handleHyperstarDouble()` does not need expansion, since it already clears the whole board.

### Protections
- Hyperstar is excluded from plain color-run detection (`isHyperstarCell()` passed into `findMatches()`).
- Same-color wipes and convert combos skip any other Hyperstar.
- A Hyperstar can still be swept up by a physical area blast. When it is, it fires its random-color wipe first.

### Special-gem spawn placement
For the first cascade step after a player swap, a spawned special prefers a swapped cell that is part of the matched group. If both qualify, the destination cell wins. Later cascade steps use the fallback (middle of the run, or the L/T intersection).

## 3. Scoring pipeline

For each cascade step:

1.  Calculate formed-match scores using the gem's current base
    score/multiplier.
2.  Apply match-size multiplier.
3.  Score incidental cells cleared by special-gem effects.
4.  Apply combo scaling.
5.  Apply flat match bonuses such as Affinity/Frenzy where applicable.
6.  Add global flat bonus.
7.  Apply global multiplier.
8.  Round the final result.

Conceptually:

``` text
raw match/incidental score
→ combo multiplier
→ flat match bonuses
→ global bonus
→ global multiplier
→ round
```

`calculateGemAttributedScore()` intentionally excludes the global bonus
for Elite gem-subscore tracking.

## 4. Boon system

### Per-gem archetypes (11 per gem × 11 gems = 121 entries)

| Archetype | Effect | Rarity | Max |
|---|---|---|---|
| Affinity | +100 flat per match of that gem | Common | 1 |
| Frenzy | +200 flat on that gem's matches; −50 flat on matches of two random other unlocked gems | Uncommon | 1 |
| Polish | +5 base score and +0.1 base multiplier | Common | ∞ |
| Bounty | +20 base score | Uncommon | 2 |
| Brilliance | +50 base score; −10 base score on two random other unlocked gems | Rare | 3 |
| Opulence | +250 base score; −10 base score on every other gem | Epic | 2 |
| Grandeur | +500 base score | Legendary | 1 |
| Enthusiast | +0.5 base multiplier | Common | 2 |
| Addict | +2.0 base multiplier; −0.5 on two random other unlocked gems | Rare | 2 |
| Maniac | +2.5 base multiplier (no drawback) | Epic | 2 |
| Fanatic | +15.0 base multiplier | Legendary | 1 |

There is no Carat archetype anymore. The old 110-per-gem/4-global numbers are obsolete.

### Other boon families

| Boon | Effect | Rarity / Max |
|---|---|---|
| Forbidden `<Gem>` (11) | +250 score / +2.5 mult on that gem; −250 / −2.5 on one random other unlocked gem | Epic / 1 each |
| Threesome / Foursome / Fivesome Matchmaker | +0.5 / +1 / +1.5 to the match-3 / 4 / 5 multiplier | Uncommon / 3 each |
| Entropy / Luminous / Explosive Shard | Match-3: +10%/copy chance of a bonus Hyperstar / Laser / Discharger, plus an independent +10%/copy (summed across all held shards) chance of an Obsidian | Rare / 2 each |
| Frantic Star | Hyperstar activation also wipes a second random color; 5% chance per cascade settle of a Hyperstar self-activating (two random colors) | Epic / 2 |
| Warmonger | +250 global bonus; can no longer decline an Elite | Uncommon / 1 |
| Adventure Junkie | +2.5 global multiplier; can no longer decline a Challenge | Uncommon / 1 |
| Perpetual Boon | +1% of current score per copy at the end of every level | Rare / ∞ |
| Overcharge Essence | Event-only. At level start, converts 2 random plain gems per copy into a Laser/Discharger | Legendary / 2 |
| Booner | Shop-only. +25% per copy chance of one bonus boon offer per cleared level | Rare / 3 |
| VIP Membership Card | Shop-only. −10% on every shop price | Legendary / 1 |

### Global / non-series boons

| Boon | Effect | Rarity / Max |
|---|---|---|
| Gemstone Gamble | +50 global bonus | Rare / 5 |
| Trinket Wager | +300 global bonus, +15% target | Epic / 5 |
| Gem Greed | +1 global multiplier, +50% target | Epic / 2 |
| Jewel Avarice | +4 global multiplier, +150% target | Legendary / 2 |
| Jeweler | +25 base score on every gem | Epic / 2 |
| Gemologist | +1.5 base multiplier on every gem | Legendary / 2 |

### Rarity weights (level-up roll only)
Common 50% / Uncommon 25% / Rare 15% / Epic 8% / Legendary 2%. The shop is equal-weight per available boon and ignores these weights.

### Reserved offers
The normal generators exclude `perpetual_boon`, event-only boons (`overcharge_essence`) and shop-only boons (`booner`, `vip_membership_card`). Event reward pools apply the same exclusion via `isReservedBoon()`.

### Reversible effects
Each picked boon gets a unique `pickId`. `applyBoonEffect()` returns a record of exactly what it mutated. It is stored on the active boon as `appliedEffect` and later consumed by `reverseBoonEffect()`. This matters for random penalty targets: reversal must undo the recorded targets, never reroll them.

Presence-only boons (`flag_no_op`: Frantic Star, Booner, VIP) and recurring/triggered ones (Perpetual Boon, Crystallized Parasite) are non-reversible by design. Their effects live in `main.js`.

Each picked boon receives a unique `pickId`.

`applyBoonEffect()` returns a record of the exact mutations it made.
This is stored on the active boon and later consumed by
`reverseBoonEffect()`.

This matters especially for random penalty targets: reversal must undo
the recorded targets rather than rerolling them.

## 5. Curse system

Curses live in `curseState.activeCurses`, deliberately separate from `boonState`. Curses have no cap, and duplicates are allowed.

`CURSE_POOL` order matters: **`CURSE_POOL[0]` must stay Weight of Greed**, because Lost Miner's absorb indexes it directly.

### Weight of Greed
+10% target score. Effective immediately (the effect recalculates `scoreTarget`), which in practice is the next level, because events fire after the level clear. Removable.

### Crystallized Parasite
Drains 15% of current score at the end of every cleared level, before any shop. It is a recurring triggered effect handled in `applyScoreGain()`. Granted by Gem Cultivator's loss. Removable.

### Decaying Birthstone
Tracks one random unlocked gem per curse instance. Each instance keeps its own clear count. Reaching 100 ends the run. **Now grantable** via `grantRandomCurse()` (Meditating Elf and To Open or To Not Open).

### Petrified
Locks one random unlocked gem's base multiplier to 0 at read time (`getGemBaseMultiplier()`). Underlying deltas keep accumulating but have no visible effect while the lock holds. **Now grantable** the same way.

### Random curse grants
`grantRandomCurse()` (`gameplay/event.js`) picks uniformly from the whole `CURSE_POOL`, builds the per-pick data for Birthstone/Petrified, then does the standard `grantCurse()` + `applyBoonEffect()` two-step.

### Removal
Customer Service's Curse Removal Service reverses the effect, then removes the curse.

## 6. Consumables

### Belt

-   3 fixed inventory slots.
-   Items do not stack; two copies use two slots.
-   No discard option currently.
-   Belt is displayed below the message line in a centered horizontal
    row.

### Items

  Item                                Current behavior

  Pickaxe                             Target one cell; destroys it and
                                      triggers a special's blast if
                                      appropriate

  Dynamite                            Target a 3×3 area; same
                                      chain-reaction rules as Pickaxe

  Dice                                Target a 3×3 area and Fisher-Yates
                                      shuffle the usable cells' colors in
                                      that area

  Golden Ticket                       Doubles all score gains for the
                                      next 9 real player-swap turns

  Resurrection Cross                  Activates on deadlock, with a
                                      choice to try other board-changing
                                      consumables first


Dice excludes Obsidian from its shuffle.

Golden Ticket counts only real player swaps, not consumable actions.

### Shop prices
Each is a percentage of `shopEntryScore`, then the VIP discount if held:
Pickaxe 10% / Dynamite 20% / Dice 20% / Golden Ticket 30% / Resurrection Cross 60%.

### Shop offer rules
- 3 distinct types per visit (shuffle-and-take).
- If a Resurrection Cross is already on the belt, it is removed from the candidate pool (a second copy is wasted, since it is passive and non-stacking).
- A full belt blocks all consumable purchases.

## 7. Events

### Trigger
After the final queued level reward, an event may fire.

Chance ladder: `5%, 10%, 20%, 35%, 55%, 75%`. A miss advances the ladder. A fired event resets it. If the roll succeeds but nothing is eligible, it counts as a miss.

Type weights: Encounter 50% / Elite 20% / Challenge 30%, renormalized over eligible types.

Event IDs are shared across all types and marked seen the moment the event is shown. They never repeat within a run.

Only one Elite/Challenge modifier can be active at a time. This is structurally true (one roll per level-up), not enforced by a guard.

### Shared rules for random rewards
- Random boons come from `generateBoonOffer(count, clearedLevel)`: rarity-weighted, `levelUp` rarity gate, normal `maxOccurrences`, reserved boons excluded, padded with Perpetual Boon if the pool runs dry. Boons granted in one call are distinct.
- Challenge rewards ignore occurrence caps.
- Random curses use `grantRandomCurse()` (see §5).
- Event/curse names in result text use `formatNamedEffectSpan()` (dashed underline, tooltip, rarity color).

### Encounters (5)

| Encounter | Eligibility | Behavior |
|---|---|---|
| The Gem Mole (`trade`) | Holds a boon with a valid same-rarity replacement | Trade a held boon for a same-rarity replacement |
| Fortune's Folly (`gamble`) | Score > 0 | Bet 10/25/50/75/100% (deducted immediately); 50/50; win → double-or-nothing loop or cash out; a loss only ever costs the original wager; "Pay 5% and leave" skips |
| The Lost Miner (`help_or_absorb`) | Always | Help → +15% score; Absorb → one normal boon + Weight of Greed; Leave → nothing |
| The Meditating Elf (`steal`) | Always | Steal takes 2 items, each an independent 50/50 boon-or-curse roll (25% two boons / 25% two curses / 50% one each); Leave is a no-op |
| To Open or To Not Open (`chest`) | Holds at least 1 boon | Roll on click: 25% treasure (2 random boons + 15% score, clamped ≥ 0); 75% Mimic (one random held boon reversed and removed, replaced by a random curse, −15% of \|score\|). Reserved boons are valid Mimic victims |

### Elites (3)

| Elite | Win condition | Win | Lose | Decline |
|---|---|---|---|---|
| Boon Hoarder | `time_race`: doubled level target within 3 min | 3 Epic boons (bypass caps) | Lose 2 random boons | Lose 1 random boon |
| Cultist's Ritual | `gem_cap`: ≤ 30 of one random unlocked gem (matches + incidental) | Target −20% (permanent) | Target +20% (permanent) | Target +10% (permanent) |
| Gem Cultivator | `gem_subscore_race`: earn 25% of the remaining target from one random gem | +50% score | Crystallized Parasite | 50/50: free, or −25% score |

- Only the reward-granting Elite (Boon Hoarder) is gated by `hasEligibleEliteReward()`.
- The `time_race` target doubling is **not** permanent. `advanceLevel()` overwrites it. Only `target_percent` uses the permanent `targetScoreMultiplier`.
- Warmonger makes the Decline button struck-through and inert, with a red note.
- Gem activity tracking runs from normal matches, all swap combos, and Pickaxe/Dynamite.
- Elite/Challenge results appear in a dialog before the level-up dialog, and also in History.

### Challenges (2)

**The Silent Vein.** Three levels, `failOnDetonation: true`. A detonation is any special gem firing (passive blast, swap combo, or a consumable clear that touches a special). It is checked at each level clear. A detonation fails the challenge at the next level clear. If all 3 levels clear cleanly, the reward is 1 Legendary boon from the normal pool. The objective banner shows remaining levels.

**A Test of Endurance.** One level. It has no `failOnDetonation`, so special gems never affect it. Its rules:
- −5% of current score every 5 s, evaluated lazily at cascade-settle time and compounding per elapsed interval. It uses |score|, so a negative score keeps sinking.
- Must clear within 5 minutes, checked only when the level clears.
- The reward comes from the event-only pool (Overcharge Essence), exempt from rarity gates.

Adventure Junkie makes the Decline button inert on Challenge dialogs.

## 8. Shop

The shop opens every 5th cleared level, checked per queued cleared level. A `shopOpenedForLevel` guard (reset at the start of each queued level in `runLevelUpQueue()`) ensures a Booner bonus pick can never open a second shop for the same level.

### Boon shop
- 5 equal-weighted offers, using the `shop` rarity row of `BOON_RARITY_MIN_CLEARED_LEVEL`.
- Board-placement boons and reserved boons are excluded.
- Bought boons share `maxOccurrences` and the effect machinery with free picks.
- A card is disabled after purchase for that visit.
- On viewports ≥ 1400px wide, all 5 cards sit in one row. Below that, they wrap 3 per row.

Price:

```text
price = ROUND(500 × r × 1.15^(tier-1) × 1.0)  +  ROUND(shopEntryScore × r)
        then × 0.9 (rounded) if VIP Membership Card is held
r: Common 0.10 / Uncommon 0.15 / Rare 0.30 / Epic 0.45 / Legendary 0.70
tier = clearedLevel / 5
```

`shopEntryScore` is a snapshot taken when the shop opens, so prices never drift after purchases. Affordability is checked against live score.

### Consumable shop
See §6 for prices and offer rules. Consumables render as belt-style squares with a hover tooltip and the price underneath.

### Customer Service
Only ONE of these two services can be used per visit:

1. **Curse Removal Service.** Opens an inline picker. Price is 25% / 50% / 75% of `shopEntryScore` for the 1st / 2nd / 3rd+ use this run (run-wide counter). Shows "Not available" with no curses.
2. **Limited Edition Boons Sale.** One random available shop-only boon (Booner / VIP), priced like a normal boon of its rarity. Shows "Out Of Service" if none remain.

## 9. Obsidian

A permanent inert board cell (`OBSIDIAN = -2`).

- Cannot match, cannot swap, cannot be targeted by consumables.
- Falls under gravity.
- Falls off the true bottom of its column (`settleObsidianOffBoard()`).
- Has dedicated SVG art.
- Spawns from Entropy/Luminous/Explosive Shard on a plain match-3, as a roll independent of the bonus-special roll.
- **It always lands on one of the triggering match-3's own 3 cells**, never elsewhere on the board. If a bonus special claimed one cell this step, that cell is excluded. That cell is also removed from the clear set, so it survives as Obsidian. Any special-gem overlay on it is nulled (a matched Laser/Discharger there has already fired via the chain-reaction BFS), so no orphan overlay remains. The match still scores at full match-3 length.
- A reshuffle wipes existing Obsidian.
- `pickObsidianTargetCell()` in `obsidian.js` is now unused (kept in case a "spawn anywhere" mechanic returns).

## 10. Event/consumable tracking integration

Pickaxe and Dynamite clears now participate in: - Elite gem activity
tracking - Silent Vein detonation tracking when a special gem is
actually involved - Decaying Birthstone clear tracking

Dice already enters the normal cascade pipeline and therefore receives
the same tracking.

## 11. UI systems worth preserving

-   Left-side Gem Stats panel.
-   Target-score multiplier footer.
-   Active Curses list.
-   Right-side History panel, capped at 200 entries.
-   Event result dialogs.
-   Numbered single-column event choices for Encounter, Elite, and
    Challenge.
-   Rarity-colored boon names and dashed hover tooltips.
-   Curse and consumable names use the same inline tooltip pattern.
-   Event titles use `[Type] --- [Name]`.

## 12. Input, hints, and UI systems

### Input
- Click-then-click swap, plus press-and-drag (`DRAG_SWAP_THRESHOLD_PX = 16`). Both are wired together per cell in `wireCellInteraction()`.
- Obsidian and BLOCKED cells cannot be selected or dragged.
- While `placementMode` or a consumable is armed, board clicks are redirected.

### Hint
After `HINT_DELAY_MS` (10 s) idle, a random legal move gets a pulsing glow. Only a real resolved match or a failed swap restarts the timer. A plain click does not.

### Game over
- The stuck-board game over waits `NO_MOVES_GAME_OVER_DELAY_MS` (2 s) after the message, then shows a dialog.
- Level-up dialogs are deferred until the whole cascade settles.

### Panels and banners
- **Left panel:** per-gem base score / multiplier / match bonus, with green (boosted) / red (penalized) coloring relative to defaults. It also shows global stats, the target multiplier, and the Active Curses list.
- **Right panel:** History (capped at 200, newest first). Tones: positive, negative, neutral, levelup, boon, event.
- **Objective banner:** ticks every second for Elite/Challenge status.
- **Golden Ticket banner and consumable belt.**

### Text conventions
- Event story text uses `\n\n` for paragraph breaks (`white-space: pre-line`).
- `showEventResult()` and `renderHistoryPanel()` render via `innerHTML`. All strings come from the game's own static data.
- Event dialog titles read `[Type] --- [Name]`.
- Choice buttons in Encounter/Elite/Challenge dialogs are numbered, in a single column.