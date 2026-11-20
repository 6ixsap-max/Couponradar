import { CHAMPIONS } from '../src/data'
import { buildRunePage } from '../src/engine/runes'
import type { Lane } from '../src/types'
const cases: [string, string, Lane][] = [
  ['Lux','Zed','MID'], ['Darius','Teemo','TOP'], ['Caitlyn','Draven','ADC'],
  ['Soraka','Leona','SUP'], ['LeeSin','Karthus','JNG'], ['Jax','Fiora','TOP'],
  ['Malzahar','Yasuo','MID'], ['Thresh','Lulu','SUP'], ['Vayne','Chogath','ADC'],
]
for (const [a,b,l] of cases) {
  const p = buildRunePage(CHAMPIONS[a], CHAMPIONS[b], l)
  console.log(`${a} vs ${b} (${l})`)
  console.log(`   ${p.primaryStyle}: ${p.keystone.name} + ${p.primary.map(r=>r.name).join(', ')}`)
  console.log(`   ${p.subStyle}: ${p.secondary.map(r=>r.name).join(', ')} | shards ${p.shards.map(s=>s.name).join(', ')}`)
  console.log(`   spells ${p.summoners.map(s=>s.title).join(' + ')}`)
}
