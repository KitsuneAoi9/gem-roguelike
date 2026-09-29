# CHANGELOG --- Consolidated Decisions and Superseded History

This file intentionally keeps only history that helps prevent
regressions or explains why the current architecture looks unusual.
Routine bugfix history from the individual handoff files has been
removed.

## 1. Major system transitions

### Board construction → board expand/shrink

The original button-driven Construct/Deconstruct feature was replaced by
boon-driven board expansion/shrinkage.

The board is now a fixed 20×20 allocation with an initially usable 8×8
region. The old bonus-tile marker mechanic remains dormant.

Later, the four board-shape boon entries were removed from the active
boon pool. The placement implementation remains in the codebase so the
feature can be restored without rebuilding the underlying board system.

### Flame / Star / Hypercube → Laser / Discharger / Hyperstar

The special-gem system was substantially redesigned:

-   Flame was replaced by directional Lasers.
-   Star was reworked into the Discharger.
-   Hypercube was renamed/reworked as Hyperstar.
-   Special-gem swaps became explicit legal moves for deadlock
    detection.
-   Hyperstar was made swap-activated rather than normally
    chain-detonated.

Later fixes specifically protected Hyperstars from same-color scans and
made Hyperstars caught by Laser/Discharger blasts fire instead of
silently disappearing.

### Old boon pool → current data-driven boon system

The original 110 per-gem + 4 global design was replaced by the later
11-archetype-per-gem design plus global, event-only, and shop-only
entries.

Do not restore the old pool numbers, old rarity table, or old Legendary
gate from the early handoffs.

### Old Legendary gate → configurable rarity gates

The single `LEGENDARY_UNLOCK_LEVEL` constant was replaced by
`BOON_RARITY_MIN_CLEARED_LEVEL`, with separate level-up, event, and shop
gates.

This was necessary after queued level-up rewards were introduced: the
current progression level can be ahead of the reward being handed out.

### One level-up reward → queued cleared-level rewards

Originally, a large score gain could advance multiple levels while only
showing one reward.

The current system queues every cleared level and processes each reward
in order. Shops are checked per cleared level, while the random event is
rolled once after the final reward.

### Special-gem chain reactions in swap combos

Originally chain reactions (a caught special firing its own effect)
existed only for passive matches and consumables. Swap-activated combos
used their raw cleared cells, so specials caught in a combo were deleted
without firing. `expandChainReaction()` now runs at every swap-combo call
site, with the two swapped cells excluded via `currentSwapKeys`.

### Shard Obsidian targeting

Obsidian from Entropy/Luminous/Explosive Shard originally landed on a
random cell anywhere on the board, which could silently overwrite an
unrelated special gem. It now targets one of the triggering match-3's own
3 cells only. Do not revert this to board-wide targeting.

## 2. Scoring history that should not be restored

The target-score formula changed several times during Parts 3--5. The
current formula is the milestone-scaled formula in `PROJECT_HANDOFF.md`;
older formulas are intentionally omitted.

The global score order also changed:

``` text
old: (score after flat bonuses × global multiplier) + global bonus
new: (score after flat bonuses + global bonus) × global multiplier
```

When debugging score output, use the current order.

## 3. Shop evolution

The original artifact/relic/fossil shop remains dormant.

The active shop evolved into: - boon shop - consumable shop - customer
service

A key historical bug was that prices based on live score decreased after
each purchase. The current system snapshots `shopEntryScore` when the
shop opens so prices remain stable during that visit.

## 4. Event evolution

The event system was built after the boon reversibility foundation.

Current event architecture: - Encounter / Elite / Challenge - shared
chance ladder - shared seen-event IDs - weighted eligible type
selection - explicit event result dialogs - event-specific reward gating

Silent Vein was originally a one-level challenge and later became a
three-level challenge.

A Test of Endurance went through several revisions before settling on: -
one-level Challenge - 5-second score decay - 5-minute clear limit
checked at level clear - normal target - event-only Overcharge Essence
reward

Two Encounters were added later: The Meditating Elf (`steal`) and To Open
or To Not Open (`chest`). Shared helpers `grantRandomBoons()` and
`grantRandomCurse()` establish the general rule for random event rewards
(same rules as Lost Miner's absorb; Challenge rewards ignore occurrence
caps).

`markChallengeDetonation()` originally failed ANY active Challenge on any
special-gem activity. That rule belongs only to Silent Vein, so it is now
gated by a `failOnDetonation` flag on the def. A Test of Endurance ignores
special gems entirely.

## 5. Curse evolution

The initial curse system was intentionally minimal and began with Weight
of Greed.

It later gained: Crystallized Parasite, Decaying Birthstone, Petrified,
and removability through Customer Service.

Decaying Birthstone and Petrified were built first with no grant trigger.
They are now granted by the random-curse pool used by the Meditating Elf
and To Open or To Not Open. `CURSE_POOL` is "always duplicable"; curses
needing caps/uniqueness belong in a separate, not-yet-built pool.

## 6. Consumable evolution

The belt was initially placed beside the board. It was later moved below
the message line into a centered horizontal row.

Dice was originally a whole-board shuffle. It is now a targeted 3×3
shuffle.

Resurrection Cross was originally an automatic deadlock rescue. It now
gives the player an opportunity to try another board-changing consumable
first.

## 7. Important bugfixes whose behavior should remain

-   Invalid swaps restart the hint timer.
-   Special-gem swaps count as legal moves for deadlock detection.
-   Hyperstar's own cell is scored using its actual underlying gem.
-   Hyperstar same-color wipes do not accidentally destroy another
    Hyperstar.
-   Hyperstar caught by Laser/Discharger blast fires.
-   Discharger only spawns from a genuine L/T shape.
-   Side-stat and event tooltips were constrained to avoid clipping.
-   Event story text supports paragraph breaks and is left-aligned.
-   Elite/Challenge results appear in a dialog before level-up.
-   Consumable clears participate in Elite/Challenge/Decaying Birthstone
    tracking.
-   Golden Ticket counts real player swaps rather than arbitrary
    cascade/consumable calls.
-   Reserved event-only/shop-only boons cannot leak into normal event
    reward generation.
-   Golden Ticket's required constant import was fixed.
-   Negative-score Test of Endurance decay now continues downward
    correctly.
-   Special gems caught inside swap-activated combos chain-react
    (Part 13).
-   A Test of Endurance is not failed by special-gem activity.
-   Booner's bonus offer cannot open a second shop for the same cleared
    level (`shopOpenedForLevel`).
-   The Resurrection Cross is never offered in the consumable shop while
    one is already held.
-   Shard Obsidian spawns only on the triggering match's own cells.
-   Shard Obsidian nulls any special-gem overlay on its cell, so no
    orphaned Laser/Discharger overlay sits under an Obsidian.

## 8. Known intentional simplifications

Keep these as explicit design notes rather than "fixing" them
accidentally:

1.  Obsidian is currently wiped by a full board reshuffle.
2.  Physical area blasts can still clear a Hyperstar caught in their
    area.
3.  Frantic Star's second random-color wipe is folded into the primary
    scoring group.
4.  Decaying Birthstone and Petrified are now grantable via random-curse
    pools. Mimic/Elf can therefore hand out a lethal curse.
5.  Board-shape boon entries are currently absent from the active pool.
6.  The dormant bonus-tile system has not been integrated into scoring.
7.  Moves-limit mode remains disabled/shelved unless its flag is
    enabled.
8.  The old artifact/relic/fossil shop is not the active shop.
9.  Reserved boons can still be traded away by the Gem Mole; only
    received random rewards are restricted.
10. Chain-reaction expansion is implemented in three separate places
    (`resolveSpecialGems()`, `expandConsumableBlast()`,
    `expandChainReaction()`) rather than one shared function.
11. Reserved boons (Booner, VIP) can be Mimic victims.
12. `pickObsidianTargetCell()` is dead code.
13. `forceFailChallenge()` is unused.

## 9. Current source of truth

When an older handoff conflicts with a later one, use the later
implementation described in the current handoff, especially Parts
10--12.

The final state is defined by the latest confirmed behavior, not by the
chronology of the old handoff files.
