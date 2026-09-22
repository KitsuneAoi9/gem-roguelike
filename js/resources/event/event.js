// ============================================================
// EVENT.JS (resources) — the fixed event catalog.
//
// NEW THIS ROUND — ENCOUNTER_POOL entries now carry a `kind` field
// ('trade' | 'gamble' | 'help_or_absorb') since the three Encounters
// no longer share one shape: Gem Mole is a simple binary trade,
// Fortune's Folly is a looping bet-or-cash-out gamble, and Lost Miner
// is a three-way choice with a boon-AND-curse outcome. gameplay/
// event.js and main.js both dispatch on this field to pick the right
// logic/dialog for a given encounter, same spirit as boon_effects.js
// dispatching on effect.kind.
//
// Every multi-paragraph flavor-text block below uses "\n\n" between
// paragraphs — css/design/dialog.css's .event-story now has
// white-space: pre-line so those breaks actually render as visual
// paragraph gaps instead of collapsing into one run-on line.
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

// --- Encounter pool ---
export const ENCOUNTER_POOL = [
  {
    id: 'gem_mole',
    kind: 'trade', // NEW field — see file header
    name: 'The Gem Mole',
    storyText: "A small mole pokes its head out of a fresh tunnel, clutching a glimmering trinket between its paws. It chitters excitedly and gestures between your boons and its own. It wants to make a trade — but the mole has no interest in letting you choose. One of your boons will be taken at random, and in exchange, you'll receive another boon of the same rarity.",
    acceptLabel: 'Let the mole choose',
    declineLabel: 'Decline',
    resultAcceptText: (givenName, receivedName) =>
      `You trade ${givenName} for ${receivedName}. The mole chitters happily and scurries back into its tunnel.`,
    resultDeclineText: "You decline its offer. The mole's eyes narrow. It remembers your face.",
  },

  // NEW — Fortune's Folly: a looping double-or-nothing gamble.
  // `betOptions` drives the INITIAL node's bet buttons (main.js's
  // showFortunesFollyDialog()); `payAndLeave` is the 6th initial
  // choice (skip the gamble entirely). Every *Text field that takes a
  // `pot` argument is filled in with the LIVE pot amount at display
  // time — this file only ever holds the text TEMPLATE, never the
  // number itself (Rule 6/7: numbers belong to gameplay-computed
  // state, not baked into resource strings).
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

  // NEW — Lost Miner: a three-way choice (help / absorb / leave).
  // `helpResultText`/`absorbResultText` are functions since their
  // final line needs the actual amount/boon-name/curse-name resolved
  // at click time (gameplay/event.js's resolveLostMinerHelp()/
  // resolveLostMinerAbsorb()) — same convention as Fortune's Folly's
  // pot-dependent text above.
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

// --- Elite pool (unchanged this round) ---
export const ELITE_POOL = [
  {
    id: 'gem_elitist',
    name: 'Gem Elitist',
    storyText: "A towering, crystalline figure blocks your path, arms folded. \"Prove your worth,\" it booms, \"— double the score, a third of the time. Succeed, and I'll share my hoard. Fail, and I'll take a keepsake instead.\"",
    fightLabel: 'Fight',
    fleeLabel: 'Flee',
    fleeText: 'You slip past without a fight. The Gem Elitist lets you go, unbothered.',
    winText: 'You break through! The Gem Elitist grudgingly hands over two Epic boons.',
    loseText: 'Time runs out before you can finish. The Gem Elitist snatches a boon from you as its price.',
    targetMultiplier: 2,
    timeLimitMs: 3 * 60 * 1000,
    winRewardRarity: BOON_RARITY.EPIC,
    winRewardCount: 2,
    losePenalty: { kind: 'lose_random_boon' },
    declinePenalty: null,
  },
];

// --- Challenge pool (unchanged this round) ---
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