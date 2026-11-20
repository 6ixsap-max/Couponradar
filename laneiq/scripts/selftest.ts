import { CHAMPIONS, CHAMPION_LIST, ALL_RUNES } from '../src/data'
import { evaluateMatchup, recommend } from '../src/engine/matchup'
import { buildRunePage } from '../src/engine/runes'
import type { Lane, Profile } from '../src/types'

const LANES: Lane[] = ['TOP', 'JNG', 'MID', 'ADC', 'SUP']
let pages = 0, errors: string[] = []
const wrs: number[] = []

for (const me of CHAMPION_LIST) {
  for (const foe of CHAMPION_LIST) {
    if (me.id === foe.id) continue
    const lane = (me.lanes.find(l => foe.lanes.includes(l)) ?? me.lanes[0]) as Lane
    const r = evaluateMatchup(me, foe, lane)
    if (!isFinite(r.modelWinRate)) errors.push(`NaN ${me.id} vs ${foe.id}`)
    wrs.push(r.modelWinRate)
  }
}
for (const me of CHAMPION_LIST) {
  for (const lane of LANES) {
    for (const foe of CHAMPION_LIST.slice(0, 40)) {
      if (me.id === foe.id) continue
      try {
        const p = buildRunePage(me, foe, lane)
        pages++
        const ids = p.lcu.selectedPerkIds
        if (ids.length !== 9) errors.push(`${me.id}/${foe.id}/${lane}: ${ids.length} perks`)
        for (const id of ids.slice(0, 6)) if (!ALL_RUNES[id]) errors.push(`${me.id}: bad rune ${id}`)
        if (new Set(ids.slice(0, 6)).size !== 6) errors.push(`${me.id}/${foe.id}/${lane}: duplicate runes`)
        // keystone must be in slot 0 of its tree, minors must not repeat a slot
        const tree = p.primaryStyle
        if (ALL_RUNES[p.keystone.id].tree !== tree) errors.push(`${me.id}: keystone tree mismatch`)
        for (const s of p.secondary) if (ALL_RUNES[s.id].tree !== p.subStyle) errors.push(`${me.id}: secondary tree mismatch`)
        if (p.primaryStyle === p.subStyle) errors.push(`${me.id}: same primary and secondary tree`)
      } catch (err) { errors.push(`${me.id}/${foe.id}/${lane}: ${(err as Error).message}`) }
    }
  }
}

wrs.sort((a, b) => a - b)
const q = (p: number) => wrs[Math.floor(wrs.length * p)].toFixed(1)
console.log(`matchups evaluated : ${wrs.length}`)
console.log(`win-rate spread    : min ${q(0)} / p05 ${q(0.05)} / median ${q(0.5)} / p95 ${q(0.95)} / max ${wrs[wrs.length-1].toFixed(1)}`)
console.log(`rune pages built   : ${pages}`)
console.log(`errors             : ${errors.length}`)
errors.slice(0, 15).forEach(e => console.log('  !', e))

// sanity: a known hard counter should rank near the top of a sample pool
const profile: Profile = {
  name: 'test', region: 'EUW', rank: 'Gold', mainLane: 'MID', masteryWeight: 30,
  pool: [
    { id: 'Malzahar', lane: 'MID', games: 20, wins: 11, comfort: 3 },
    { id: 'Lux',      lane: 'MID', games: 40, wins: 21, comfort: 4 },
    { id: 'Yasuo',    lane: 'MID', games: 15, wins: 6,  comfort: 2 },
    { id: 'Orianna',  lane: 'MID', games: 30, wins: 16, comfort: 4 },
    { id: 'Vex',      lane: 'MID', games: 10, wins: 6,  comfort: 3 },
  ],
}
for (const foe of ['Zed', 'Xerath', 'Kassadin']) {
  const out = recommend(profile, foe, 'MID')
  console.log(`\nvs ${foe}:`)
  out.forEach(p => console.log(`  ${p.winRate.toFixed(1)}%  ${p.champion.name.padEnd(10)} ${p.reasons[0]?.text.slice(0, 90) ?? ''}`))
}
const page = buildRunePage(CHAMPIONS.Malzahar, CHAMPIONS.Zed, 'MID')
console.log('\nrune page Malzahar vs Zed:', JSON.stringify(page.lcu))
console.log('keystone:', page.keystone.name, '—', page.keystone.why)
