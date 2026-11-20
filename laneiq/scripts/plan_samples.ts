import { CHAMPIONS } from '../src/data'
import { buildGamePlan } from '../src/engine/gameplan'
import type { Lane } from '../src/types'
const cases: [string,string,Lane][] = [
  ['Malzahar','Zed','MID'], ['Darius','Teemo','TOP'], ['Caitlyn','Draven','ADC'],
  ['Leona','Soraka','SUP'], ['LeeSin','Karthus','JNG'],
]
for (const [a,b,l] of cases) {
  const p = buildGamePlan(CHAMPIONS[a], CHAMPIONS[b], l)
  console.log(`\n═══ ${a} vs ${b} (${l}) — ${p.archetype}`)
  console.log(p.thesis)
  for (const ph of p.phases) console.log(`\n  [${ph.label}] ${ph.text}`)
  console.log(`\n  WAVE: ${p.wave}`)
  console.log(`  TRADE: ${p.trading}`)
  console.log(`  RESPECT: ${p.respect.join(' | ')}`)
  console.log(`  WIN: ${p.winCondition}`)
  console.log(`  LOSS: ${p.lossCondition}`)
}
