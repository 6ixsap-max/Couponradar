import type { Champion, Lane, Pick, PoolEntry, Profile, Reason } from '../types'
import { CHAMPIONS } from '../data'
import { counterNote } from './counters'

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x))
const tanh = (x: number) => Math.tanh(x)

interface Term {
  value: number            // signed contribution
  good: string             // sentence when positive
  bad: string              // sentence when negative
  phase: 'lane' | 'game'
}

/**
 * Lane-phase and mid-game model.
 *
 * Every term is a signed comparison of two 0..1 features, scaled by a weight.
 * The sum is squashed through tanh so no single term can run away, then mapped
 * to a win-rate estimate. Positive = `me` is favoured.
 */
function terms(me: Champion, foe: Champion, lane: Lane): Term[] {
  const m = me.f, e = foe.f
  const t: Term[] = []
  // What matters depends on the lane you are standing in.
  const waveF = lane === 'SUP' ? 0.3 : lane === 'TOP' ? 0.85 : 1
  const allinF = lane === 'TOP' ? 1.15 : lane === 'SUP' ? 0.85 : 1
  const scaleF = lane === 'ADC' ? 1.3 : lane === 'SUP' ? 0.7 : 1
  const mapF = lane === 'MID' || lane === 'JNG' || lane === 'SUP' ? 1.35 : 0.75
  const fightF = lane === 'SUP' ? 1.4 : lane === 'TOP' ? 0.8 : 1
  const rangeGap = clamp((me.range - foe.range) / 400)

  // 1. Range war — only meaningful when one side can actually use the gap
  if (Math.abs(rangeGap) > 0.15) {
    const usable = rangeGap > 0 ? m.poke * 0.6 + 0.4 : e.poke * 0.6 + 0.4
    t.push({
      value: rangeGap * usable * 0.55,
      good: `${me.name} out-ranges ${foe.name} by ${me.range - foe.range} units and can trade for free`,
      bad: `${foe.name} out-ranges you by ${foe.range - me.range} units — you give up free damage walking up to CS`,
      phase: 'lane',
    })
  }

  // 2. Poke vs sustain, both directions
  t.push({
    value: (m.poke - e.sustain) * 0.30 - (e.poke - m.sustain) * 0.30,
    good: `Your poke beats their sustain — you can push them out of lane before they heal it back`,
    bad: `They chip you faster than you heal it off — you lose the attrition war`,
    phase: 'lane',
  })

  // 3. All-in: can you commit and live?
  const myAllin = m.allin * (0.5 + 0.5 * m.early)
  const foeAllin = e.allin * (0.5 + 0.5 * e.early)
  t.push({
    value: (myAllin * (1 - e.durability * 0.6) - foeAllin * (1 - m.durability * 0.6)) * 0.55 * allinF,
    good: `You win the all-in — your committed trade pattern is stronger than theirs`,
    bad: `They win the straight all-in, so you have to play for farm and short trades`,
    phase: 'lane',
  })

  // 4. CC that lands vs mobility that dodges
  t.push({
    value: (m.cc * (1 - e.mobility * 0.7) - e.cc * (1 - m.mobility * 0.7)) * 0.35,
    good: `Your crowd control sticks to them; theirs is easier for you to dodge`,
    bad: `Their crowd control lands on you and yours is easy for them to move out of`,
    phase: 'lane',
  })

  // 5. Skillshot reliance into a mobile target
  if (me.tags.includes('skillshot') && e.mobility > 0.55)
    t.push({ value: -(e.mobility - 0.5) * 0.45, good: '', bad: `Your damage is skillshot-based and ${foe.name} is mobile enough to dodge it`, phase: 'lane' })
  if (foe.tags.includes('skillshot') && m.mobility > 0.55)
    t.push({ value: (m.mobility - 0.5) * 0.45, good: `${foe.name} relies on skillshots and you are mobile enough to sidestep them`, bad: '', phase: 'lane' })
  if (me.tags.includes('antimobile') && e.mobility > 0.6)
    t.push({ value: (e.mobility - 0.5) * 0.5, good: `You have reliable lock-down against a dash-reliant champion`, bad: '', phase: 'lane' })
  if (foe.tags.includes('antimobile') && m.mobility > 0.6)
    t.push({ value: -(m.mobility - 0.5) * 0.5, good: '', bad: `They have point-and-click lock-down that negates your mobility`, phase: 'lane' })

  // 6. Burst threat vs your ability to survive it
  t.push({
    value: (m.burst * (1 - e.safety * 0.5 - e.durability * 0.4) - e.burst * (1 - m.safety * 0.5 - m.durability * 0.4)) * 0.35,
    good: `You can delete them from a trade; they cannot do the same to you`,
    bad: `They can burst you down from a single mistake — respect their kill threshold`,
    phase: 'lane',
  })

  // 7. Wave control decides who can roam / recall / take plates
  t.push({
    value: (m.waveclear - e.waveclear) * 0.22 * waveF,
    good: `Better wave clear — you control when the wave crashes and when you leave lane`,
    bad: `They clear the wave faster and will dictate where the wave sits`,
    phase: 'lane',
  })

  // 8. Damage type vs what the enemy naturally resists
  if (me.damage !== 'MIX') {
    const resisted = (me.damage === 'AD' && foe.tags.includes('antiad')) ||
                     (me.damage === 'AP' && foe.tags.includes('antimagic'))
    if (resisted) t.push({ value: -0.35, good: '', bad: `${foe.name} is built to blunt ${me.damage === 'AD' ? 'physical' : 'magic'} damage specifically`, phase: 'lane' })
  }
  if (foe.damage !== 'MIX') {
    const resisted = (foe.damage === 'AD' && me.tags.includes('antiad')) ||
                     (foe.damage === 'AP' && me.tags.includes('antimagic'))
    if (resisted) t.push({ value: 0.35, good: `You blunt their ${foe.damage === 'AD' ? 'physical' : 'magic'} damage profile directly`, bad: '', phase: 'lane' })
  }

  // 9. Early tempo
  t.push({
    value: (m.early - e.early) * 0.30,
    good: `You are stronger in the first six levels — take the early tempo`,
    bad: `They are stronger early — survive the first back and the lane gets easier`,
    phase: 'lane',
  })

  // 10. Scaling (mid/late game)
  t.push({
    value: (m.scaling - e.scaling) * 0.40 * scaleF,
    good: `You out-scale them — a farmed lane is already a win`,
    bad: `They out-scale you, so you need to convert your lead before three items`,
    phase: 'game',
  })

  // 11. Can you actually kill what they become?
  t.push({
    value: (m.antitank * e.durability - e.antitank * m.durability) * 0.35,
    good: `You have the damage profile to cut through what they build`,
    bad: `They have the tools to cut through your build, you struggle to kill theirs`,
    phase: 'game',
  })

  // 12. Teamfight utility
  t.push({
    value: ((m.cc + m.engage + m.peel) - (e.cc + e.engage + e.peel)) / 3 * 0.28 * fightF,
    good: `You bring more to a teamfight than they do, so your lead travels`,
    bad: `They bring more teamfight utility, so an even lane favours them later`,
    phase: 'game',
  })

  // 13. Map pressure
  t.push({
    value: ((m.roam + m.splitpush) - (e.roam + e.splitpush)) / 2 * 0.22 * mapF,
    good: `You apply more pressure off your own lane once the wave is handled`,
    bad: `They can leave lane and make plays elsewhere more easily than you`,
    phase: 'game',
  })

  return t
}

export interface MatchupResult {
  lanePhase: number
  teamfight: number
  total: number
  modelWinRate: number
  reasons: Reason[]
}

export function evaluateMatchup(me: Champion, foe: Champion, lane: Lane): MatchupResult {
  const ts = terms(me, foe, lane)
  let lane_ = 0, game = 0
  const reasons: Reason[] = []

  for (const t of ts) {
    if (t.phase === 'lane') lane_ += t.value; else game += t.value
    const txt = t.value > 0 ? t.good : t.bad
    if (txt && Math.abs(t.value) > 0.06)
      reasons.push({ text: txt, weight: Math.abs(t.value), kind: t.value > 0 ? 'good' : 'bad' })
  }

  const note = counterNote(me.id, foe.id)
  if (note) {
    lane_ += note.d
    reasons.push({
      text: note.d > 0
        ? `Known matchup: ${note.why}`
        : `Known matchup against you: ${note.why}`,
      weight: Math.abs(note.d) + 1,          // always surfaced first
      kind: note.d > 0 ? 'good' : 'bad',
    })
  }

  if (me.difficulty >= 8)
    reasons.push({ text: `${me.name} is a high-difficulty champion — this pick only pays off if you are comfortable`, weight: 0.05, kind: 'note' })

  const lanePhase = clamp(tanh(lane_ * 0.9))
  const teamfight = clamp(tanh(game * 1.1))
  const total = lanePhase * 0.68 + teamfight * 0.32
  const modelWinRate = 50 + 13.5 * total

  reasons.sort((a, b) => b.weight - a.weight)
  return { lanePhase, teamfight, total, modelWinRate, reasons }
}

/** Bayesian-shrunk personal win rate so three lucky games don't dominate. */
export function personalWinRate(entry: PoolEntry, prior = 20) {
  return (entry.wins + 0.5 * prior) / (entry.games + prior)
}

export function confidenceOf(entry: PoolEntry, hasNote: boolean): Pick['confidence'] {
  if (entry.games >= 30 || hasNote) return 'high'
  if (entry.games >= 8) return 'medium'
  return 'low'
}

export function recommend(profile: Profile, foeId: string, lane: Lane): Pick[] {
  const foe = CHAMPIONS[foeId]
  if (!foe) return []
  const w = profile.masteryWeight / 100

  const picks: Pick[] = profile.pool
    .filter(p => p.lane === lane && CHAMPIONS[p.id] && p.id !== foeId)
    .map(entry => {
      const champ = CHAMPIONS[entry.id]
      const r = evaluateMatchup(champ, foe, lane)

      // personal performance, shrunk, plus self-rated comfort
      const pwr = personalWinRate(entry)
      const history = (pwr - 0.5) * 100 * 0.55
      const comfort = (entry.comfort - 3) * 1.6
      const comfortDelta = (history + comfort) * w * 2

      const reasons = [...r.reasons]
      if (Math.abs(comfortDelta) > 1.5)
        reasons.unshift({
          text: comfortDelta > 0
            ? `Your own record: ${entry.wins}/${entry.games} (${Math.round((entry.games ? entry.wins / entry.games : 0.5) * 100)}%) and comfort ${entry.comfort}/5 push this pick up`
            : `Your own record on ${champ.name} (${entry.wins}/${entry.games}, comfort ${entry.comfort}/5) drags this pick down`,
          weight: Math.abs(comfortDelta) / 10,
          kind: comfortDelta > 0 ? 'good' : 'bad',
        })

      return {
        champion: champ,
        entry,
        modelWinRate: r.modelWinRate,
        winRate: Math.max(28, Math.min(72, r.modelWinRate + comfortDelta)),
        comfortDelta,
        lanePhase: r.lanePhase,
        teamfight: r.teamfight,
        confidence: confidenceOf(entry, !!counterNote(champ.id, foe.id)),
        reasons: reasons.slice(0, 6),
      }
    })

  return picks.sort((a, b) => b.winRate - a.winRate)
}

/** Best counters across the whole roster — used for "champions worth learning". */
export function bestInRoster(foeId: string, lane: Lane, exclude: Set<string>, limit = 6) {
  const foe = CHAMPIONS[foeId]
  if (!foe) return []
  return Object.values(CHAMPIONS)
    .filter(c => c.lanes.includes(lane) && c.id !== foeId && !exclude.has(c.id))
    .map(c => ({ champion: c, ...evaluateMatchup(c, foe, lane) }))
    .sort((a, b) => b.modelWinRate - a.modelWinRate)
    .slice(0, limit)
}
