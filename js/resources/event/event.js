// ============================================================
// EVENT.JS (resources) — the fixed event catalog.
//
// A Test of Endurance (CHALLENGE_POOL) now carries THREE combined
// rules, per the design sheet:
//   1. decayEffect        — -5% of current score every 5 seconds,
//                            checked at cascade-settle time (NOT a
//                            live wall-clock timer).
//   2. timeLimitMs        — must clear the level within 5 minutes.
//                            Resolved the SAME way Boon Hoarder's
//                            time_race already is: only evaluated at
//                            the moment the level actually clears
//                            (score reaches target) — there's no
//                            independent timeout that fires on its
//                            own if the player just never clears it.
//   3. (the normal level target) — reaching progressionState.scoreTarget
//                            is what makes the win-check above even
//                            run in the first place, same as any
//                            other level.
// `durationLevels: 1` reuses the exact multi-level Challenge engine
// Silent Vein already uses — it just resolves on the very first
// level-clear, since nothing here needs to span multiple levels.
// ============================================================

import { BOON_RARITY } from '../boon/boon.js';

export const EVENT_TYPE = {
  ENCOUNTER: 'encounter',
  ELITE: 'elite',
  CHALLENGE: 'challenge',
};

export const EVENT_TYPE_WEIGHTS = {
  [EVENT_TYPE.ENCOUNTER]: 0.50,
  [EVENT_TYPE.ELITE]: 0.20,
  [EVENT_TYPE.CHALLENGE]: 0.30,
};

export const EVENT_CHANCE_LADDER = [0.05, 0.10, 0.20, 0.35, 0.55, 0.75];

// --- Encounter pool (unchanged) ---
export const ENCOUNTER_POOL = [
  {
    id: 'gem_mole',
    kind: 'trade',
    name: 'The Gem Mole',
    storyText: "A small mole pokes its head out of a fresh tunnel, clutching a glimmering trinket between its paws. It chitters and gestures back and forth between your boons and its own — it wants to make a trade.",
    acceptLabel: 'Trade a boon',
    declineLabel: 'Decline',
    resultAcceptText: (givenName, receivedName) =>
      `You trade ${givenName} for ${receivedName}. The mole chitters happily and scurries back into its tunnel.`,
    resultDeclineText: "You decline its offer. The mole's eyes narrow. It remembers your face.",
  },
  {
    id: 'fortunes_folly',
    kind: 'gamble',
    name: "Fortune's Folly",
    storyText:
      "Deep inside an abandoned mine, a stranger in an immaculate suit sits beside an old gemstone table, idly flipping a coin between their fingers. As you approach, they glance at your score and smile.\n\n" +
      "\u201cQuite a fortune you've amassed. Shame to leave it sitting there.\u201d\n\n" +
      "They place the coin on the table.\n\n" +
      "\u201cDouble it, and walk away. Or double it again. And again. There is no limit.\u201d\n\n" +
      "The stranger leans back with a knowing smile.\n\n" +
      "\u201cOf course, you may stop whenever you like. The only rule is simple: when your luck runs out, you lose your bet.\u201d\n\n" +
      "The stranger grins.\n\n" +
      "\u201cSo. How much are you willing to risk?\u201d",
    betOptions: [
      { percent: 0.10, label: 'Bet 10% of your score' },
      { percent: 0.25, label: 'Bet 25% of your score' },
      { percent: 0.50, label: 'Bet 50% of your score' },
      { percent: 0.75, label: 'Bet 75% of your score' },
      { percent: 1.00, label: 'Bet 100% of your score' },
    ],
    payAndLeave: {
      percent: 0.05,
      label: 'Pay 5% and leave',
      resultText:
        "You place the agreed portion of your fortune on the table. The stranger quietly pockets it and gives you a knowing smile.\n\n" +
        "\u201cA wise gambler knows when to walk away.\u201d\n\n" +
        "They lean back in their chair. \u201cThough I wonder how much more you could have won.\u201d\n\n" +
        "After a moment, they smile.\n\n" +
        "\u201cFortune has a price. At least you knew when to pay it.\u201d",
    },
    doubleLabel: 'Double or Nothing',
    cashOutLabel: 'Call it a day and leave',
    initialWinText: (pot) =>
      `The coin spins through the air and lands with a satisfying clink. The stranger watches it for a moment before breaking into a grin.\n\n\u201cFortune favors the bold.\u201d\n\nYour wager doubles to ${pot}, and the stranger slides an invisible ledger across the table.\n\n\u201cSo... shall we do it again?\u201d`,
    initialLoseText:
      "The coin spins once, twice, three times before settling on the losing side.\n\nThe stranger quietly sweeps away your wager with a smile.\n\n\u201cAh. Fortune has changed its mind.\u201d\n\nThe stranger's smile widens as they collect your wager.\n\n\u201cYou knew the risk.\u201d",
    doubleOrNothingWinText: (pot) =>
      `You push your winnings back across the table. The stranger raises an eyebrow, then breaks into a grin.\n\n\u201cAgain? You really do have a taste for fortune.\u201d\n\nThey pick up the coin and flick it into the air. The coin lands in your favor — your winnings double to ${pot}. The stranger laughs and pushes the ledger toward you.\n\n\u201cStill lucky. How long do you think that will last?\u201d`,
    doubleOrNothingLoseText:
      "You push your winnings back across the table. The stranger raises an eyebrow, then breaks into a grin.\n\n\u201cAgain? You really do have a taste for fortune.\u201d\n\nThey pick up the coin and flick it into the air. The coin lands against you. The stranger calmly sweeps your wager off the table.\n\n\u201cThere it is. Fortune always comes to collect eventually.\u201d",
    callItADayText: (pot) =>
      `You push your chair back and rise from the table. The stranger chuckles as they settle your winnings — ${pot} — into your hands.\n\n\u201cLeaving already? A shame. But a prudent gambler lives to bet another day.\u201d`,
  },
  {
    id: 'lost_miner',
    kind: 'help_or_absorb',
    name: 'The Lost Miner',
    storyText:
      "A faint voice calls from beneath a collapsed tunnel. A miner is pinned beneath several rocks, clutching a small pouch of gemstones. Among them, you sense the presence of a Boon.\n\n\u201cHelp me out, and I'll make it worth your while.\u201d",
    helpLabel: 'Help the miner',
    absorbLabel: "Absorb the miner's Boon",
    leaveLabel: 'Leave them be',
    helpScorePercent: 0.15,
    helpResultText: (amount) =>
      `You carefully clear the rubble and pull the miner free. He coughs, brushes the dust from his clothes, and lets out a relieved sigh.\n\n\u201cI thought I was going to become part of this mine.\u201d\n\nGrateful, he presses a small pouch of gemstones into your hands — worth ${amount} score.`,
    absorbResultText: (boonName, curseName) =>
      `You reach toward the miner's Boon instead of the rubble. Its glow begins to fade as you draw its power into yourself.\n\nThe miner stares at you in disbelief.\n\n\u201cWait... what are you doing? You wretched thief! May the earth swallow you whole!\u201d\n\nThe miner curses and struggles helplessly beneath the rubble as the Boon's power disappears into you.\n\nYou have received ${boonName}, but the miner's curse has taken hold. ${curseName} has been applied to you.`,
    leaveResultText:
      "You glance at the trapped miner one last time before turning away. You decide that their fate is not your concern.\n\n\u201cWait! You can't just leave me here!\u201d\n\nTheir desperate cries echo through the tunnels as you walk away, eventually fading into the darkness.",
  },
  // ============================================================
  // MEDITATING ELF — kind 'steal'.
  // Two independent 50/50 rolls (boon or curse) decide what the
  // player steals: 25% two boons, 25% two curses, 50% one of each.
  // ============================================================
  {
    id: 'meditating_elf',
    kind: 'steal',
    name: 'The Meditating Elf',
    storyText:
      "You happen upon a strange elven creature crouching in a secluded corner, desperately trying to conceal itself in the darkness.\n\n" +
      "You watch from a distance as it hurriedly stuffs its boons and curses into a worn bag, checking around to make sure nobody has noticed. Once everything is safely tucked away, it settles down, closes its eyes, and begins to meditate.\n\n" +
      "Its breathing slows. Its body relaxes. Whatever awareness it had of the outside world seems to disappear completely.\n\n" +
      "The bag rests beside it, unattended.\n\n" +
      "You could probably take something before it notices.\n\n" +
      "But in this darkness, you won't be able to tell what you're grabbing.",
    stealLabel: 'Steal',
    leaveLabel: 'Mind your own business',
    stealCount: 2,       // how many items are taken from the bag
    boonChance: 0.5,     // per item: 50% boon, 50% curse
    // `names` is an array of pre-built HTML spans (boon/curse names).
    stealResultText: (names) =>
      `You carefully approach the creature and reach into its bag. Your hand disappears into the darkness, brushing past strange objects of all shapes and sizes. You feel around for something valuable, but there is no way to tell a boon from a curse until you pull it out.\n\n` +
      `You steal ${names.join(' and ')} from its bag.`,
    leaveResultText:
      "You decide that rummaging through a meditating creature's belongings is probably more trouble than it's worth. You quietly leave the creature to its meditation, taking care not to disturb it.",
  },
  // ============================================================
  // TO OPEN OR NOT TO OPEN — kind 'chest'.
  // 25% treasure (2 boons + 15% score), 75% Mimic (one held boon is
  // turned into a curse + lose 15% score). Rolled on click.
  // ============================================================
  {
    id: 'to_open_or_not_to_open',
    kind: 'chest',
    name: 'To Open or To Not Open',
    storyText:
      "You come across a chest sitting alone in the darkness. It is covered in elaborate decorations, its edges adorned with intricate metalwork and faded gemstones. Despite its age and worn appearance, a faint aura of treasure radiates from within. Whatever is inside, it is valuable.\n\n" +
      "Then you notice the skeleton lying beside it.\n\n" +
      "You stop.\n\n" +
      "You have heard stories about Mimics\u2014creatures that disguise themselves as treasure chests, waiting patiently for some unfortunate fool to open them.\n\n" +
      "You look at the chest again.\n\n" +
      "It looks like a perfectly ordinary chest.\n\n" +
      "Perhaps a little too ordinary.\n\n" +
      "You could open it and find a fortune.\n\n" +
      "Or you could become the next skeleton beside it.",
    openLabel: 'To open',
    leaveLabel: 'Not to open',
    treasureChance: 0.25,   // chance the chest is real treasure
    treasureBoonCount: 2,   // boons granted on treasure
    scorePercent: 0.15,     // +15% on treasure, -15% on Mimic
    // `names` = array of boon-name spans, `amount` = score gained.
    openTreasureText: (names, amount) =>
      `The lid creaks open. You brace yourself for teeth, but instead, a warm golden light spills from within. Beneath the dust and cobwebs lies a small hoard of treasure, along with two boons gleaming among the gems. Maybe the skeleton was simply unlucky.\n\n` +
      `You obtained ${names.join(' and ')} and 15% of your current score (${amount}).`,
    // `boonName`/`curseName` = HTML spans, `amount` = score lost.
    openMimicText: (boonName, curseName, amount) =>
      `The moment you lift the lid, the chest snaps open with a violent screech. Rows of teeth emerge from inside as the Mimic lunges forward and clamps down on one of your boons. Strange, dark energy seeps from its jaws into the boon, twisting its power into something foul. The Mimic tears itself away, turning ${boonName} into ${curseName} and devouring 15% of your current score (${amount}).`,
    leaveResultText:
      "You take one last look at the chest. Whatever treasure lies inside, the skeleton beside it is a convincing argument to leave it alone. You swallow your curiosity and walk away.",
  },
];

// --- Elite pool (unchanged) ---
export const ELITE_POOL = [
  {
    id: 'boon_hoarder',
    name: 'Boon Hoarder',
    storyText:
      "A grotesque figure emerges from a cavern filled with piles of gemstones and ancient treasures. Its body is covered in countless boons, bound together like trophies.\n\n" +
      "Its eyes immediately fall upon your collection.\n\n" +
      "\u201cMore...\u201d it whispers. \u201cNeed. more.\u201d\n\n" +
      "It reaches toward your Boons with trembling hands.\n\n" +
      "\u201cGive them to me. Or I will take them myself.\u201d",
    fightLabel: 'Defend your boons',
    declineLabel: 'Surrender your boons',
    winCondition: { kind: 'time_race', targetMultiplier: 2, timeLimitMs: 3 * 60 * 1000 },
    onWin: { kind: 'grant_boons', rarity: BOON_RARITY.EPIC, count: 3, bypassCap: true },
    onLose: { kind: 'lose_random_boons', count: 2 },
    decline: { kind: 'fixed_penalty', penalty: { kind: 'lose_random_boons', count: 1 } },
    winText: (grantedNames) =>
      `You manage to fend off the Gem Hoarder, sending it stumbling back into its pile of treasures. It clutches its collection tightly, glaring at you with envy.\n\n\u201cMy precious...boons!\u201d\n\nWith the Hoarder defeated, you search through its collection and claim ${grantedNames.join(', ')} for yourself.`,
    loseText: (removedNames) =>
      `The Gem Hoarder overwhelms you and tears ${removedNames.join(' and ')} from your collection. It holds the prize close, its eyes gleaming with satisfaction.\n\n\u201cMine... two more for my collection.\u201d`,
    declineText: (removedNames) =>
      `You reluctantly hand over ${removedNames[0] || 'a boon'}. The Hoarder greedily gathers it into its collection, barely able to contain its excitement.\n\n\u201cYes... yes!\u201d\n\nIt steps aside, allowing you to pass.`,
  },

  {
    id: 'cultist_ritual',
    name: "Cultist's Ritual",
    storyText:
      "You stumble upon a lone cultist kneeling before a strange gemstone altar. Dark energy pulses through the chamber as the cultist chants an unfamiliar incantation.\n\n" +
      "They notice you, but make no attempt to stop you.\n\n" +
      "Whatever ritual they are performing, you suspect it will make your journey considerably more difficult.",
    fightLabel: 'Interrupt the ritual',
    declineLabel: 'Leave them be',
    winCondition: { kind: 'gem_cap', gemCap: 30 },
    onWin: { kind: 'target_percent', percent: -0.20 },
    onLose: { kind: 'target_percent', percent: 0.20 },
    decline: { kind: 'fixed_penalty', penalty: { kind: 'target_percent', percent: 0.10 } },
    winText: "The ritual shatters as the cultist falls to the ground. The strange energy surrounding the altar rapidly fades.\n\nYou have disrupted the ritual before it could reach its full power. The target score for the rest of your journey decreases by 20%.",
    loseText: "The ritual overwhelms you. The cultist returns to the altar as the dark energy surges through the chamber.\n\n\u201cYou should have left us alone.\u201d\n\nThe ritual continues, stronger than before. The target score for the rest of your journey increases by 20%.",
    declineText: "You decide it is best not to interfere. The cultist resumes their chanting as you quietly leave the chamber.\n\nBehind you, the ritual grows louder. You feel the weight of the ritual settle upon your journey. The target score for the rest of your journey increases by 10%.",
  },

  {
    id: 'gem_cultivator',
    name: 'Gem Cultivator',
    storyText:
      "A strange man sits cross-legged in the middle of the tunnel, surrounded by a faint aura of shimmering gemstones. As you approach, his eyes immediately turn toward your score.\n\n" +
      "\u201cSuch a fine fortune...\u201d he murmurs. \u201cI can sense its energy from here.\u201d\n\n" +
      "He raises one hand, and the gemstones around him begin to glow.\n\n" +
      "\u201cA fortune like that should not be left uncultivated.\u201d\n\n" +
      "The gemstones around him begin to glow brighter. You can feel his energy reaching toward your fortune.\n\n" +
      "You realize you have only a brief moment before his technique takes hold.",
    fightLabel: 'Retaliate',
    declineLabel: 'Slip away',
    winCondition: { kind: 'gem_subscore_race', thresholdPercent: 0.25 },
    onWin: { kind: 'score_percent', percent: 0.50 },
    onLose: { kind: 'grant_curse', curseId: 'crystallized_parasite' },
    decline: {
      kind: 'coinflip_penalty',
      penalty: { kind: 'score_percent', percent: -0.25 },
      successText: "You seize the brief opening and slip past the Cultivator. For a moment, you feel his presence following you... then it suddenly fades. You managed to get away safely.",
      failureText: "You seize the brief opening and try to slip past the Cultivator. For a moment, you feel his presence following you... then it closes in. 25% of your current score is taken by the Gem Cultivator.",
    },
    winText: "You successfully harness the power of the gemstone before reaching your target. The Gem Cultivator's expression darkens as his technique collapses.\n\n\u201cImpossible... You have cultivated it faster than I could.\u201d\n\nYou take advantage of his hesitation and claim 50% of your current score as your reward.",
    loseText: "The Gem Cultivator's technique overwhelms you. Before you can complete the challenge, the opportunity slips away.\n\nHe smiles as the gemstone's energy fades. \u201cYour talent may be lacking, but your body will more than make up for it.\u201d\n\nA strange parasite emerges from his hand and burrows into your body before you can react. A parasite has been implanted within you.",
  },
];

// --- Challenge pool ---
export const CHALLENGE_POOL = [
  {
    id: 'no_detonation',
    name: 'The Silent Vein',
    storyText: "The rock face hums with unstable energy — one wrong spark and the whole vein could go off. \"Clear these levels without setting anything off,\" a voice echoes from within the stone, \"and the vein's treasure is yours.\"",
    acceptLabel: 'Accept the challenge',
    declineLabel: 'Decline',
    durationLevels: 3,
    winText: "The vein stays silent through all three levels. As promised, a Legendary boon settles into your hands.",
    failText: "Somewhere along the way, the vein cracked — a special gem went off before the challenge's window ran out. The vein's treasure slips away.",
    rewardRarity: BOON_RARITY.LEGENDARY,
    rewardCount: 1,
  },

  // A Test of Endurance — see file header for the 3-rule breakdown.
  {
    id: 'a_test_of_endurance',
    name: 'A Test of Endurance',
    storyText:
      "You encounter a strange creature sitting in the middle of the path. At first, you mistake it for some enormous stone, until its two enormous eyes slowly turn toward you and blink. It resembles a giant frog, though its proportions are strangely wrong, with a body far too large for its stubby limbs and eyes far too big for its face.\n\n" +
      "You stare at it. It stares back.\n\n" +
      "Neither of you moves. Neither of you speaks. Its enormous eyes narrow slightly, as though it is sizing you up. You narrow yours in response. One of its eyes twitches. You raise an eyebrow. Its pupils shift to follow the movement.\n\n" +
      "Then the air begins to change.\n\n" +
      "A chill creeps across the ground, and frost slowly spreads around the creature's feet. Your breath turns white in the air, but the creature remains completely still. You shiver. Its eyes squeeze tighter.\n\n" +
      "You endure the cold.\n\n" +
      "The temperature suddenly rises. Heat ripples through the air, sweat gathers on your brow, and the frost melts away. The creature doesn't even blink. You wipe the sweat from your face without breaking eye contact.\n\n" +
      "A spark of electricity jumps between you. Then another. Static crawls across your skin, your hair begins to rise, and small arcs of lightning crackle around the creature. Still, those enormous eyes remain fixed on yours.\n\n" +
      "You finally understand.\n\n" +
      "This isn't a fight. It isn't a test of strength. Neither of you intends to move, and neither of you intends to look away. Somehow, without a single word being spoken, you both know exactly what the rules are.\n\n" +
      "The first to give in loses.",
    acceptLabel: 'Stand your ground!',
    declineLabel: 'Give in.',
    acceptResultText:
      "You stand firm on your ground. Whatever this creature thinks it can endure, you intend to endure longer. You steady yourself and meet its enormous gaze without flinching.",
    durationLevels: 1,
    decayEffect: { percent: 0.05, intervalMs: 5000 }, // rule 1 — -5% every 5s, checked at cascade-settle time
    timeLimitMs: 5 * 60 * 1000, // NEW — rule 2 — must clear within 5 minutes, checked at level-clear time (same rule Boon Hoarder's time_race already follows — see gameplay/event.js)
    useEventOnlyRewardPool: true,
    rewardCount: 1,

    winText:
      "You refuse to look away. The creature's enormous eyes begin to twitch as its composure slowly crumbles. It squeezes its eyes shut, lets out a deep, rumbling croak, and suddenly retches. With a wet splatter, a strange Boon is vomited from its mouth and lands at your feet. The creature stares at it, then at you, as if deeply offended by what just happened.\n\n" +
      "You obtained Overcharged Essence.",
    // Used for BOTH the time-limit loss AND (as a fallback) a
    // reward-pool-exhausted edge case — see gameplay/event.js's
    // checkChallengeLevelClear(), which reads `loseText ?? failText`.
    loseText:
      "You hold its gaze as long as you can, but your resolve finally begins to falter. Your eyes sting. Your vision blurs. You blink. The creature remains perfectly still, its enormous eyes staring back at you. A strange sense of defeat washes over you as you realize it never even came close to giving in.",
    declineText:
      "You break the stare and look away. Whatever strange contest the creature had in mind, you decide it isn't worth enduring. The creature continues to watch you in silence, its enormous eyes following your every movement.",
  },
];