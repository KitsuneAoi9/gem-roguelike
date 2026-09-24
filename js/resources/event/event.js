// ============================================================
// EVENT.JS (resources) — the fixed event catalog.
//
// REWORKED THIS ROUND — ELITE_POOL entries no longer share one shape.
// Gem Elitist (single time-race mechanic) is retired in favor of
// three structurally different fights, each declaring its own
// `winCondition` (a tagged union, same spirit as boon effect.kind):
//   - 'time_race'         — Boon Hoarder: beat the (doubled) target
//                            within a time limit.
//   - 'gem_cap'            — Cultist's Ritual: clear the level without
//                            matching/destroying more than N of one
//                            random gem type.
//   - 'gem_subscore_race'  — Gem Cultivator: earn a threshold amount
//                            of score specifically from one random gem
//                            type before the level clears.
// `onWin`/`onLose` are a second tagged union describing the OUTCOME
// effect (grant boons / lose boons / permanent target-% shift / one-
// time score-% swing) — gameplay/event.js's applyEliteOutcomeEffect()
// is the single dispatcher for these, mirroring boon_effects.js's
// applyBoonEffect() pattern. `decline` is a THIRD tagged union
// ('free' | 'fixed_penalty' | 'coinflip_penalty') describing what,
// if anything, happens when the player walks away instead of fighting.
//
// Text fields that need to reflect what actually happened (which
// boons were granted/lost) are FUNCTIONS taking those names as
// arguments; plain fights use plain strings. gameplay/event.js
// resolves either shape via its resolveMaybeFn() helper.
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

// --- Encounter pool (UNCHANGED from prior round) ---
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
];

// --- Elite pool — REWRITTEN THIS ROUND (see file header) ---
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

    // Grants 3 Epic boons, exempt from maxOccurrences — same
    // treatment the old Gem Elitist's win reward used.
    onWin: { kind: 'grant_boons', rarity: BOON_RARITY.EPIC, count: 3, bypassCap: true },
    // Loses 2 random held boons — reversed via the shared
    // appliedEffect/reverseBoonEffect plumbing, same as everywhere
    // else a boon is taken away.
    onLose: { kind: 'lose_random_boons', count: 2 },

    // "Surrender" gives up exactly ONE random held boon, no fight at all.
    decline: { kind: 'fixed_penalty', penalty: { kind: 'lose_random_boons', count: 1 } },

    // `grantedNames`/`removedNames` are string[] filled in by
    // applyEliteOutcomeEffect() at resolution time.
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

    // gemCap: cannot clear more than this many of a random unlocked
    // gem type this level (matches + incidental both count). Breaching
    // it does NOT end the fight early — only checked at level-clear.
    winCondition: { kind: 'gem_cap', gemCap: 30 },

    // Both target-% effects are PERMANENT — they stack into
    // boonEffectState.targetScoreMultiplier, same mechanism the
    // global-score boons already use, so they affect every future
    // level's target, not just this one.
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

    // thresholdPercent: 0.25 of (this level's target - score when the
    // fight began), earned specifically from ONE random unlocked gem
    // type (matches + incidental), must be reached before the level
    // clears.
    winCondition: { kind: 'gem_subscore_race', thresholdPercent: 0.25 },

    // One-time score swings, NOT permanent — computed off the LIVE
    // score at the moment the level actually clears (per design).
    onWin: { kind: 'score_percent', percent: 0.50 },
    // CHANGED — was { kind: 'score_percent', percent: -0.50 }, an
    // immediate one-time score deduction. Losing now instead implants
    // the Crystallized Parasite (resources/curse/curse.js) — a recurring
    // 15%-of-score drain triggered at the end of every level from
    // here on, rather than one lump-sum hit right now.
    onLose: { kind: 'grant_curse', curseId: 'crystallized_parasite' },
    // "Slip away" is a 50/50 coinflip — success costs nothing,
    // failure costs 25% of current score.
    decline: {
      kind: 'coinflip_penalty',
      penalty: { kind: 'score_percent', percent: -0.25 },
      successText: "You seize the brief opening and slip past the Cultivator. For a moment, you feel his presence following you... then it suddenly fades. You managed to get away safely.",
      failureText: "You seize the brief opening and try to slip past the Cultivator. For a moment, you feel his presence following you... then it closes in. 25% of your current score is taken by the Gem Cultivator.",
    },

    winText: "You successfully harness the power of the gemstone before reaching your target. The Gem Cultivator's expression darkens as his technique collapses.\n\n\u201cImpossible... You have cultivated it faster than I could.\u201d\n\nYou take advantage of his hesitation and claim 50% of your current score as your reward.",
     loseText: "The Gem Cultivator's technique overwhelms you. Before you can complete the challenge, the opportunity slips away.\n\nHe smiles as the gemstone's energy fades. \u201cYour talent may be lacking, but your body will more than make up for it.\u201d\n\nA strange parasite emerges from his hand and burrows into your body before you can react. A parasite curse has been implanted within you.",
  },
];

// --- Challenge pool (UNCHANGED from prior round) ---
export const CHALLENGE_POOL = [
  {
    id: 'no_detonation',
    name: 'The Silent Vein',
    storyText: "The rock face hums with unstable energy — one wrong spark and the whole vein could go off. \"Clear this level without setting anything off,\" a voice echoes from within the stone, \"and the vein's treasure is yours.\"",
    acceptLabel: 'Accept the challenge',
    declineLabel: 'Decline',
    winText: "The vein stays silent. As promised, a Legendary boon settles into your hands.",
    failText: null,
    rewardRarity: BOON_RARITY.LEGENDARY,
    rewardCount: 1,
  },
];