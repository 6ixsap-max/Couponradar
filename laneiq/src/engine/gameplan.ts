import type { Champion, Lane, Spell } from '../types'
import { counterNote } from './counters'

export interface PlanPhase { label: string; text: string }
export interface GamePlan {
  archetype: string
  thesis: string
  phases: PlanPhase[]
  wave: string
  trading: string
  respect: string[]
  winCondition: string
  lossCondition: string
}

const sec = (n: number) => `${Math.round(n)}s`

/**
 * Charge-based and passive abilities report a cooldown of 0 or 1 in Riot's
 * data (Teemo's E, Caitlyn's W). Quoting those as a trade window would be
 * nonsense, so they are left out of the plan.
 */
const timed = (s: Spell) => s.cd >= 2
const basics = (c: Champion) => c.spells.filter(s => s.k !== 'R' && timed(s))

/** The ability they most want back up — usually the escape or the engage. */
const keySpell = (c: Champion): Spell | undefined =>
  basics(c).sort((a, b) => b.cd - a.cd)[0]

/** The ability they poke and trade with — cheapest real cooldown that reaches you. */
const tradeSpell = (c: Champion): Spell | undefined => {
  const all = basics(c)
  const reach = all.filter(s => s.r >= Math.max(300, c.range - 50))
  return (reach.length ? reach : all).sort((a, b) => a.cd - b.cd)[0]
}

const ult = (c: Champion): Spell | undefined => {
  const r = c.spells.find(s => s.k === 'R')
  return r && timed(r) ? r : undefined
}

const name = (s: Spell | undefined) => (s ? `${s.k} (${s.n})` : 'their main ability')

export function buildGamePlan(me: Champion, foe: Champion, lane: Lane): GamePlan {
  const m = me.f, e = foe.f
  const rangeGap = me.range - foe.range
  const earlyEdge = m.early - e.early
  const scalingEdge = m.scaling - e.scaling
  const allinEdge = m.allin * (0.5 + 0.5 * m.early) - e.allin * (0.5 + 0.5 * e.early)
  const waveEdge = m.waveclear - e.waveclear
  const roamEdge = (m.roam + m.splitpush) - (e.roam + e.splitpush)
  const note = counterNote(me.id, foe.id)
  /**
   * A known matchup pattern does not just change the headline — it changes how
   * the lane should actually be played, so it shifts the edges the rest of the
   * plan is built from.
   */
  const shift = (note?.d ?? 0) * 0.5
  const earlyEdgeEff = earlyEdge + shift
  const allinEdgeEff = allinEdge + shift

  const myKey = keySpell(me), foeKey = keySpell(foe)
  const myTrade = tradeSpell(me), foeTrade = tradeSpell(foe)
  const myUlt = ult(me), foeUlt = ult(foe)

  if (lane === 'JNG') return junglePlan(me, foe, { earlyEdge, scalingEdge, roamEdge, note, myUlt, foeUlt, foeKey })
  if (lane === 'SUP') return supportPlan(me, foe, { earlyEdge, allinEdge, rangeGap, note, myUlt, foeUlt, foeKey, foeTrade })

  /* ------------------------------------------------------------ archetype */
  let archetype: string, thesis: string
  if (note && note.d <= -0.3) {
    archetype = 'Respect a losing matchup'
    thesis = `This is a known bad matchup and no amount of good trading makes it a good one: ${note.why}. Play it as a farming lane, get to your items without dying, and win the game somewhere other than here.`
  } else if (note && note.d >= 0.3) {
    archetype = 'Press a winning matchup'
    thesis = `You have a structural advantage here, not just a statistical one: ${note.why}. The only way you lose this lane is by forgetting that and playing it like a coin flip.`
  } else if (earlyEdge > 0.12 && allinEdge > 0.03) {
    archetype = 'Bully the early game'
    thesis = `You are stronger than ${foe.name} before either of you has an item. Every minute you spend farming politely is a minute you give that advantage away.`
  } else if (rangeGap > 95 && m.poke > 0.5 && e.sustain < 0.62) {
    archetype = 'Poke them off the wave'
    thesis = `You out-range ${foe.name} by ${rangeGap} units and they cannot heal what you chip off. Make every single CS they take cost them health.`
  } else if (scalingEdge > 0.12 && earlyEdge < 0.02) {
    archetype = 'Survive to your spike'
    thesis = `${foe.name} is stronger right now and you are stronger later. The lane is not something to win — it is something to get through without dying.`
  } else if (allinEdge > 0.06) {
    archetype = 'Short trades, then commit'
    thesis = `You win the fight once you are both committed, so the whole lane is about getting ${foe.name} into range of a fight they cannot leave.`
  } else if (roamEdge > 0.2 || (waveEdge > 0.15 && m.roam > 0.5)) {
    archetype = 'Win the lane somewhere else'
    thesis = `This matchup is close and ${foe.name} is not going anywhere. Clear faster than they do and spend the spare time on the rest of the map.`
  } else if (m.splitpush > 0.6 && scalingEdge >= -0.05) {
    archetype = 'Hold lane, win the side'
    thesis = `Neither of you kills the other for free. Take the even lane, then make the side lane a problem nobody on their team can answer alone.`
  } else {
    archetype = 'Even lane, play for tempo'
    thesis = `There is no free advantage here. The lane will be decided by cooldowns, wave state and whichever jungler shows up first.`
  }
  if (note && note.d > 0 && note.d < 0.3)
    thesis += ` ${note.why.charAt(0).toUpperCase()}${note.why.slice(1)} — that is the edge you are being handed.`
  if (note && note.d < 0 && note.d > -0.3)
    thesis += ` Be aware this is a known bad matchup: ${note.why}.`

  /* --------------------------------------------------------------- phases */
  const phases: PlanPhase[] = []

  // Levels 1-2
  if (rangeGap > 125) {
    phases.push({ label: 'Levels 1–2', text:
      `You win level 1 by standing still. ${foe.name} has to walk into your range to farm, so auto them every time they move for a minion. Do not push so hard that you lose vision of their jungler — your health advantage is worthless if you die for it.` })
  } else if (rangeGap < -125) {
    phases.push({ label: 'Levels 1–2', text:
      `Do not contest level 1. ${foe.name} out-ranges you by ${-rangeGap} units and every trade you start is one you finish at a deficit. Hold the wave on your side, take the CS you can reach safely, and accept losing two or three.` })
  } else if (earlyEdgeEff > 0.12) {
    phases.push({ label: 'Levels 1–2', text:
      `Hit level 2 first — last-hit the back minions so your wave pushes a beat ahead of theirs, then use the level advantage immediately. A two-ability lead on ${foe.name} is the largest it will be all game.` })
  } else {
    phases.push({ label: 'Levels 1–2', text:
      `Level 1 is even, so the only thing that matters is who reaches level 2 first. Track the wave, not ${foe.name} — whoever hits two with the bigger wave gets a free trade.` })
  }

  // Levels 3-5
  const jungleRisk = m.waveclear > 0.6 || rangeGap > 125
  phases.push({ label: 'Levels 3–5', text:
    earlyEdgeEff > 0.12
      ? `This is your window. ${foe.name} is at their weakest relative to you, so force trades on cooldown and look to take the first tower plate rather than a kill. ${jungleRisk ? 'You will be pushing, so ward the river entrance before every trade — this is exactly when their jungler arrives.' : 'Call your jungler while you have priority.'}`
      : earlyEdgeEff < -0.12
        ? `Survive. Give up the wave rather than your health bar, farm under tower without shame, and spend this window getting to your first back with enough gold to matter. ${foe.name} is trying to make something happen now because they know they cannot later.`
        : `Trade in short bursts around cooldowns and watch the wave more than the enemy. ${jungleRisk ? 'If you have push, you are the one who can be ganked — ward before you commit.' : 'Hold the wave slightly on your side so a gank on you fails and a gank on them works.'}` })

  // Level 6
  const ultLine = myUlt && foeUlt
    ? `Your ${name(myUlt)} comes back every ${sec(myUlt.cd)} at rank 1; theirs every ${sec(foeUlt.cd)}. `
    : foeUlt ? `Their ${name(foeUlt)} is back every ${sec(foeUlt.cd)} at rank 1. ` : ''
  phases.push({ label: 'Level 6 onward', text:
    note && note.d >= 0.3
      ? `${ultLine}This is the level where your advantage stops being theoretical: ${note.why}. ${foe.name} will still try the play — let them, and punish it.`
      : note && note.d <= -0.3
        ? `${ultLine}Six does not rescue this matchup. ${note.why}, and that is just as true with ultimates up. Keep farming and look for a play with your jungler instead of a solo kill.`
        : allinEdgeEff > 0.06
      ? `${ultLine}Six is your number. Set up the wave so it is crashing into them when you hit it, then commit — ${foe.name} does not get to walk away from a fight you start with a full rotation.`
        : e.burst > 0.75 || e.allin > 0.8
          ? `${ultLine}Respect their six more than yours. ${foe.name} gets a kill threshold at this level that you do not have an answer to yet, so play a full wave further back for the next two minutes and make them come to your tower.`
          : `${ultLine}Count their ultimate. The two minutes after they use it are the safest window you get, and the two minutes after it comes back are when you give up ground.` })

  // Mid game
  phases.push({ label: 'Mid game', text:
    m.splitpush > 0.6 && scalingEdge > -0.05
      ? `Take a side lane and make them send two people. If they send one, you kill them; if they send two, your team plays four-on-three somewhere else. Both outcomes are wins — just do not be caught doing it without vision.`
      : m.roam > 0.6
        ? `Stop treating this as a lane. Shove the wave and move — your value is the fight your team takes while ${foe.name} is still farming.`
        : (m.cc + m.engage + m.peel) / 3 > (e.cc + e.engage + e.peel) / 3
          ? `You bring more to a grouped fight than they do, so turn the lane into a five-man game as soon as the first tower falls.`
          : `Group for objectives but do not force fights ${foe.name}'s team is better equipped for. Take the even trades, keep farming, and let your scaling do the work.` })

  /* ------------------------------------------------------------ wave plan */
  let wave: string
  if (rangeGap < -125 || earlyEdgeEff < -0.12) {
    wave = `Freeze. Keep the wave just outside your tower so ${foe.name} has to over-extend to touch you, and let the minions do the job your health bar cannot. Never shove into them while you are behind — that is how a lost lane becomes a lost game.`
  } else if (earlyEdgeEff > 0.12 || rangeGap > 125) {
    wave = `Slow push. Keep an extra wave on your side, let it build, then crash it at the moment you want to fight or recall. Crashing a big wave before your back is worth more than two extra minions.`
  } else if (waveEdge > 0.15) {
    wave = `Shove and leave. You clear faster than ${foe.name}, so turn that into map time — crash the wave, take the river, and be somewhere useful while they are still last-hitting.`
  } else {
    wave = `Hold the wave slightly on your side of the lane. It makes you safe from ganks, keeps ${foe.name} in range of yours, and costs you nothing.`
  }

  /* --------------------------------------------------------------- trading */
  const trading = foeTrade
    ? `Trade when their ${name(foeTrade)} is on cooldown — ${sec(foeTrade.cd)} at rank 1. ${
        foeKey && foeKey !== foeTrade
          ? `Their ${name(foeKey)} is the one that actually matters though: ${sec(foeKey.cd)} down, and they are a different champion without it.`
          : ''
      }${myTrade ? ` Your own ${name(myTrade)} is your trade starter — do not throw it at a wave if you intend to fight in the next ${sec(myTrade.cd)}.` : ''}${
        myKey && myKey !== myTrade ? ` And do not step forward without ${name(myKey)}: it is ${sec(myKey.cd)} of being a worse champion.` : ''
      }`
    : `Trade on cooldowns rather than on instinct.`

  /* ---------------------------------------------------------------- respect */
  const respect: string[] = []
  if (foeUlt) respect.push(`${foe.name}'s level 6 — ${foeUlt.n}, back every ${sec(foeUlt.cd)} at rank 1`)
  if (e.burst > 0.75) respect.push(`Their burst window: once they commit, you do not get to walk out of it at low health`)
  if (e.cc > 0.7 && foe.tags.includes('pointclick')) respect.push(`Their crowd control is point-and-click, so positioning will not save you — hold Flash for it`)
  if (e.sustain > 0.6) respect.push(`You will not poke ${foe.name} out of lane. Trading chip damage is a waste of your mana`)
  if (e.mobility > 0.7) respect.push(`They can leave any fight they are losing, so only commit when you can actually finish it`)
  if (foe.damage === 'AD' && m.durability < 0.5) respect.push(`Early armour is worth more than a damage component against them`)
  if (foe.damage === 'AP' && m.durability < 0.5) respect.push(`Magic resist early matters more than your second damage item here`)
  if (e.roam > 0.6) respect.push(`They roam well — when ${foe.name} disappears, ping it before you keep farming`)
  if (e.poke > 0.65 && rangeGap < 0) respect.push(`Their poke adds up. You cannot stand in it and call it farming — step out of range between CS`)
  if (e.waveclear > 0.75 && m.waveclear < e.waveclear - 0.1) respect.push(`They clear faster than you, so they choose when to leave lane. Track them at every wave crash`)
  if (me.damage === 'AD' && foe.tags.includes('antiad')) respect.push(`They build specifically against physical damage — your second item has to answer that`)
  if (me.damage === 'AP' && foe.tags.includes('antimagic')) respect.push(`They have a direct answer to magic damage — plan for it before your second item`)
  if (note && note.d <= -0.3) respect.push(`The matchup itself: ${note.why}. No execution fixes that, only a different plan`)
  if (!respect.length) respect.push(`Nothing in their kit forces a change of plan — play the wave and the cooldowns`)

  /* ------------------------------------------------------------ conditions */
  const winCondition = earlyEdgeEff > 0.12
    ? `You win this lane by converting early pressure into plates and map control before ${foe.name} reaches their items. A 2/0 score with no tower damage is not a won lane.`
    : scalingEdge > 0.12
      ? `You win this lane by reaching your item spike with even farm. Gold, not kills — ${foe.name} loses the moment the game goes long.`
      : m.splitpush > 0.6
        ? `You win by making the side lane unanswerable. Lane even, then take towers while they take fights.`
        : `You win by being the one who is even in CS with more map impact — this matchup does not hand either of you a free lane.`

  const lossCondition = note && note.d <= -0.3
    ? `You lose this lane by refusing to accept it is losing. Forcing the fight that "should" work against ${foe.name} is how a 20 CS deficit becomes a 0/3 score.`
    : e.burst > 0.75 || e.allin > 0.8
    ? `You lose this lane by standing one step too far forward at level 6 with no vision. One death here funds everything ${foe.name} wants to do.`
    : earlyEdgeEff < -0.12
      ? `You lose this lane by trying to prove it is even before you have the levels for it. Dying twice early turns a survivable matchup into an unplayable one.`
      : `You lose this lane by shoving mindlessly without vision and getting collapsed on. The matchup is fine; the map is what kills you.`

  return { archetype, thesis, phases, wave, trading, respect, winCondition, lossCondition }
}

/* ------------------------------------------------------------------ jungle */
function junglePlan(me: Champion, foe: Champion, ctx: any): GamePlan {
  const m = me.f, e = foe.f
  const { earlyEdge, scalingEdge, note, myUlt, foeUlt } = ctx
  const early = earlyEdge > 0.1
  const archetype = early ? 'Early tempo jungler' : scalingEdge > 0.1 ? 'Scale and take objectives' : 'Match their tempo'
  let thesis = early
    ? `You beat ${foe.name} on the clock. Your advantage is that you can be at a fight before they can, and it disappears entirely if you full clear on autopilot.`
    : scalingEdge > 0.1
      ? `${foe.name} is stronger early than you are. Do not meet them in the first ten minutes — farm, take the objectives you can take safely, and win the game they cannot reach.`
      : `This is a tempo matchup. Whoever gets the better first clear and the first useful gank sets the pace for the whole game.`
  if (note) thesis += note.d > 0 ? ` ${note.why}.` : ` Careful: ${note.why}.`

  return {
    archetype,
    thesis,
    phases: [
      { label: 'First clear', text: early
        ? `Start on the side you want to gank from and clear toward it. If you can path to a lane that has prio at 3:15, do it — against ${foe.name} the first gank is worth more than the third camp.`
        : `Full clear safely and track them instead of fighting them. Starting the side away from ${foe.name} costs you nothing and removes their best outcome: catching you in your own jungle at level 3.` },
      { label: 'First objective', text:
        `The first drake and the voidgrubs are where this matchup is actually decided. Have the wave state checked before the timer, not after it — a jungler who arrives with no lane prio is just a free kill for their team.` },
      { label: 'Level 6 onward', text:
        `${myUlt && foeUlt ? `Your ${myUlt.n} is back every ${sec(myUlt.cd)}, theirs every ${sec(foeUlt.cd)}. ` : ''}Count theirs. Objective fights after ${foe.name} has used their ultimate are the ones you take.` },
      { label: 'Mid game', text: m.engage > 0.7
        ? `You start the fights. Find a pick before an objective rather than during it — a five-on-four around dragon beats a coin-flip five-on-five.`
        : `Play around your strongest lane and stop trying to carry every fight yourself. Farm the side camps between objectives instead of walking into vision.` },
    ],
    wave: `Jungle equivalent: never commit to a gank or an objective without knowing where their lanes are pushing. Prio is what makes a gank work, not your clear speed.`,
    trading: ctx.foeKey
      ? `In a jungle duel, their ${name(ctx.foeKey)} is the cooldown that decides it — ${sec(ctx.foeKey.cd)} at rank 1. Invading after you have seen them use it is a different fight entirely.`
      : `Only duel them with a camp or a lane advantage, not on even terms.`,
    respect: [
      foeUlt ? `${foe.name}'s ${foeUlt.n} — back every ${sec(foeUlt.cd)} at rank 1` : `Their level 6 spike`,
      e.early > 0.6 ? `They are strong before six — your own jungle is not safe` : `They scale, so do not let the game go long on even terms`,
      e.mobility > 0.7 ? `They escape ganks you think you have won` : `They are slow to rotate — punish the side of the map they are not on`,
    ],
    winCondition: early
      ? `You win by being ahead on the clock at every objective. Tempo, not kills.`
      : `You win by trading objectives evenly until your team's scaling is the deciding factor.`,
    lossCondition: `You lose by pathing predictably into ${foe.name} without vision, or by farming through an objective timer.`,
  }
}

/* ----------------------------------------------------------------- support */
function supportPlan(me: Champion, foe: Champion, ctx: any): GamePlan {
  const m = me.f, e = foe.f
  const { allinEdge, rangeGap, note, myUlt, foeUlt, foeTrade } = ctx
  const archetype = m.engage > 0.7 ? 'Engage support' : m.poke > 0.6 ? 'Poke and deny' : 'Protect and scale'
  let thesis = m.engage > 0.7
    ? `You decide when this lane happens. Against ${foe.name} the fights you choose are fine and the fights you react to are not.`
    : m.poke > 0.6
      ? `You win by making the bot lane a health-bar race. ${foe.name} should be recalling before they want to, every single time.`
      : `Your job is that your ADC never dies to ${foe.name}'s lane. Everything else — poke, roams, vision — comes second to that.`
  if (note) thesis += note.d > 0 ? ` ${note.why}.` : ` Careful: ${note.why}.`

  return {
    archetype,
    thesis,
    phases: [
      { label: 'Levels 1–2', text: rangeGap > 100
        ? `You out-range them, so the first two levels are free damage. Stand where you threaten them without standing in their jungler's path.`
        : `Do not take a level 1 fight you did not plan. Level 2 is the real spike in bot lane — whoever hits it first with a bigger wave gets the first kill chance.` },
      { label: 'Levels 3–5', text: m.engage > 0.7
        ? `Look for the engage when their wave is small and yours is big, not when you are bored. An engage into a big enemy wave is just a free kill for them.`
        : allinEdge > 0.06
          ? `You win the committed fight, so your job is to create one: hold the wave near your side and punish the moment ${foe.name} steps up for a CS.`
          : `Keep your ADC healthy and the wave in a position where their engage costs them more than it costs you. Start building the vision you will need at six.` },
      { label: 'Level 6 onward', text:
        `${myUlt && foeUlt ? `Your ${myUlt.n} is back every ${sec(myUlt.cd)}, theirs every ${sec(foeUlt.cd)}. ` : ''}Bot lane at six is decided by who uses their ultimate first and worst. Make it them.` },
      { label: 'Mid game', text: m.roam > 0.6
        ? `Once the first tower is gone you are a roaming support, not a bot laner. Follow your mid, take vision around the next objective, and stop babysitting a wave.`
        : `Move with your ADC to the objective side and win the vision war before the fight starts. Supports decide fights before they happen.` },
    ],
    wave: `Bot lane wave state is the whole lane: a wave pushing toward you is protection, a wave pushing toward them is an invitation. Do not poke while your own wave is shoving in.`,
    trading: foeTrade
      ? `Their ${name(foeTrade)} on a ${sec(foeTrade.cd)} cooldown is what you are trading around. Step up once it is used, step back once it is close to up.`
      : `Trade around their cooldowns and your ADC's, never on your own.`,
    respect: [
      foeUlt ? `${foe.name}'s ${foeUlt.n} — back every ${sec(foeUlt.cd)} at rank 1` : `Their level 6`,
      e.engage > 0.7 ? `Their engage: hold a summoner for it rather than trying to out-position it` : `Their poke: you will lose a long-range war you did not need to start`,
      `Their jungler. Bot lane dives are decided by vision placed sixty seconds earlier, not by reactions`,
    ],
    winCondition: `You win by your ADC reaching their second item alive and ahead, and by owning the vision around the first objective your team contests.`,
    lossCondition: `You lose by making a play without vision, or by being caught between protecting your ADC and chasing a kill.`,
  }
}
