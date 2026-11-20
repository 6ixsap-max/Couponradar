import type { Champion, Lane } from '../types'
import { ALL_RUNES } from '../data'

export const STYLE = {
  Precision: 8000, Domination: 8100, Sorcery: 8200, Resolve: 8400, Inspiration: 8300,
} as const
export type StyleName = keyof typeof STYLE

export interface RunePick { id: number; name: string; icon: string; short: string; why: string }
export interface Shard { id: number; name: string; why: string }
export interface Tip { title: string; why: string }

export interface RunePage {
  name: string
  primaryStyle: StyleName
  subStyle: StyleName
  keystone: RunePick
  primary: RunePick[]      // 3 minor runes
  secondary: RunePick[]    // 2 runes
  shards: Shard[]          // 3
  alternatives: { name: string; why: string }[]
  summoners: Tip[]
  items: Tip[]
  /** Payload shape the League client expects for POST /lol-perks/v1/pages */
  lcu: { name: string; primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] }
}

const SHARD_NAMES: Record<number, string> = {
  5008: 'Adaptive Force', 5005: 'Attack Speed', 5007: 'Ability Haste',
  5010: 'Move Speed', 5001: 'Health Scaling', 5011: 'Health', 5013: 'Tenacity & Slow Resist',
}

function pick(id: number, why: string): RunePick {
  const r = ALL_RUNES[id]
  if (!r) throw new Error(`unknown rune id ${id}`)
  return { id, name: r.name, icon: r.icon, short: r.short, why }
}

const has = (c: Champion, t: string) => c.tags.includes(t)

/* ------------------------------------------------------------------ keystone */
function chooseKeystone(me: Champion, foe: Champion, lane: Lane) {
  const m = me.f, e = foe.f
  const rangedBully = !me.melee === false && foe.range - me.range > 200 && e.poke > 0.5
  const alts: { name: string; why: string }[] = []

  // Melee eating ranged poke: the lane is survived, not won, in the first ten minutes
  if (me.melee && rangedBully && (lane === 'TOP' || lane === 'MID') &&
      ['juggernaut', 'warden', 'vanguard', 'battle_mage', 'specialist'].includes(me.class)) {
    alts.push({ name: 'Conqueror', why: 'if you think you can still force extended fights' })
    return { style: 'Resolve' as StyleName, id: 8437,
      why: `You are melee into ${foe.name}'s range advantage — Grasp plus a Resolve page lets you farm through the poke and still scale`, alts }
  }

  switch (me.class) {
    case 'assassin':
      if (e.durability > 0.7) {
        alts.push({ name: 'Electrocute', why: 'if you expect to find squishy targets instead' })
        return { style: 'Domination' as StyleName, id: 8128, why: `${foe.name} is too durable to one-shot in lane — Dark Harvest scales your pick-off damage into the mid game`, alts }
      }
      alts.push({ name: 'Hail of Blades', why: 'for burst that comes from autos rather than abilities' })
      return { style: 'Domination' as StyleName, id: 8112, why: `Electrocute matches your short burst combo and gives you a kill threshold on ${foe.name} from level 3`, alts }

    case 'skirmisher':
      if (e.cc > 0.7 && me.melee) {
        alts.push({ name: 'Conqueror', why: 'if you can avoid the first crowd control instead of escaping it' })
        return { style: 'Sorcery' as StyleName, id: 8230, why: `${foe.name} has heavy crowd control — Phase Rush lets you leave the fight after your combo instead of dying in it`, alts }
      }
      alts.push({ name: 'Press the Attack', why: 'for short trade patterns rather than extended ones' })
      return { style: 'Precision' as StyleName, id: 8010, why: `Your damage comes from staying in the fight — Conqueror rewards the extended trades you want against ${foe.name}`, alts }

    case 'juggernaut':
      if (e.poke > 0.6 || foe.range - me.range > 150) {
        alts.push({ name: 'Grasp of the Undying', why: 'if the lane turns into pure farming' })
        return { style: 'Precision' as StyleName, id: 8010, why: `Conqueror gives you the healing to stay in lane through ${foe.name}'s chip damage and wins any fight that lasts past three seconds`, alts }
      }
      alts.push({ name: 'Grasp of the Undying', why: 'for a safer scaling page' })
      return { style: 'Precision' as StyleName, id: 8010, why: `Conqueror is your best tool for the long trades you want against ${foe.name}`, alts }

    case 'diver':
      if (lane === 'JNG') {
        alts.push({ name: 'Electrocute', why: 'if you want a harder level-3 gank threshold' })
        return { style: 'Precision' as StyleName, id: 8010, why: `Conqueror carries your extended duels and objective fights against ${foe.name}`, alts }
      }
      alts.push({ name: 'Conqueror', why: 'if fights go long rather than ending in one combo' })
      return { style: 'Domination' as StyleName, id: 8112, why: `Your engage lands as one burst window — Electrocute converts it into a kill on ${foe.name}`, alts }

    case 'marksman':
      if (e.poke > 0.6 || (foe.range > me.range && e.early > 0.55)) {
        alts.push({ name: 'Press the Attack', why: 'if you get a safe lane and want trade damage instead' })
        return { style: 'Precision' as StyleName, id: 8021, why: `${foe.name} wins the harass war — Fleet Footwork keeps you healthy enough to farm to your item spikes`, alts }
      }
      if (m.dps > 0.85 && has(me, 'hypercarry')) {
        alts.push({ name: 'Press the Attack', why: 'for a stronger level 1-6 trade pattern' })
        return { style: 'Precision' as StyleName, id: 8008, why: `You win by auto-attacking for longer than ${foe.name} can — Lethal Tempo pays off directly`, alts }
      }
      alts.push({ name: 'Lethal Tempo', why: 'if the lane goes long and you expect late teamfights' })
      return { style: 'Precision' as StyleName, id: 8005, why: `Press the Attack rewards the short three-auto trades you can force on ${foe.name}`, alts }

    case 'artillery':
      alts.push({ name: 'First Strike', why: 'for a gold-focused poke lane you are already winning' })
      return { style: 'Sorcery' as StyleName, id: 8229, why: `Arcane Comet lands for free whenever you poke ${foe.name} from outside their range`, alts }

    case 'burst_mage':
      if (m.burst > 0.8 && e.durability < 0.6) {
        alts.push({ name: 'Arcane Comet', why: 'if they respect you and you can only poke' })
        return { style: 'Domination' as StyleName, id: 8112, why: `Electrocute turns your combo into a kill on ${foe.name} rather than a trade`, alts }
      }
      alts.push({ name: 'Electrocute', why: 'once you have the gold lead to go for kills' })
      return { style: 'Sorcery' as StyleName, id: 8229, why: `Arcane Comet is free damage every time you hit ${foe.name} with a cooldown`, alts }

    case 'battle_mage':
      alts.push({ name: 'Arcane Comet', why: 'for a poke-first laning phase' })
      return { style: 'Sorcery' as StyleName, id: 8992, why: `Your damage is sustained rather than burst — Deathfire Touch keeps ticking through the fights you want against ${foe.name}`, alts }

    case 'enchanter':
      if (e.engage > 0.7 || e.burst > 0.75) {
        alts.push({ name: 'Summon Aery', why: 'if you would rather poke than brace for engage' })
        return { style: 'Resolve' as StyleName, id: 8465, why: `${foe.name} is an engage threat — Guardian covers the moment they commit onto your carry`, alts }
      }
      alts.push({ name: 'Guardian', why: 'if their jungler keeps collapsing on your lane' })
      return { style: 'Sorcery' as StyleName, id: 8214, why: `Summon Aery adds damage to every poke and shield you throw in a lane you can control`, alts }

    case 'vanguard':
      alts.push({ name: 'Glacial Augment', why: 'if you would rather lock them down than tank for your team' })
      return { style: 'Resolve' as StyleName, id: 8439, why: `Aftershock turns your engage onto ${foe.name} into resistances exactly when you take the return damage`, alts }

    case 'warden':
      alts.push({ name: 'Aftershock', why: 'if you are the one starting fights' })
      return { style: 'Resolve' as StyleName, id: 8437, why: `Grasp builds your health lead through a lane you intend to survive rather than win outright`, alts }

    case 'catcher':
      if (e.mobility > 0.65) {
        alts.push({ name: 'Electrocute', why: 'if you land your crowd control reliably' })
        return { style: 'Inspiration' as StyleName, id: 8351, why: `${foe.name} is mobile — Glacial Augment gives you slows that make your own crowd control land`, alts }
      }
      alts.push({ name: 'Glacial Augment', why: 'against a more mobile lane' })
      return { style: 'Domination' as StyleName, id: 8112, why: `Electrocute converts your crowd control on ${foe.name} into real damage`, alts }

    default:
      alts.push({ name: 'Conqueror', why: 'for extended fights' })
      return { style: 'Sorcery' as StyleName, id: 8229, why: `Arcane Comet is the safest damage source in this matchup`, alts }
  }
}

/* --------------------------------------------------------- primary tree rest */
const PRIMARY_MINORS: Record<StyleName, (me: Champion, foe: Champion, lane: Lane) => number[][]> = {
  Precision: (me, foe) => [
    [me.resource === 'Mana' && me.f.poke > 0.5 ? 8009 : me.f.allin > 0.7 ? 9111 : 9101],
    [me.f.dps > 0.7 ? 9104 : me.class === 'juggernaut' || me.f.sustain > 0.6 ? 9103 : 9105],
    [foe.f.durability > 0.7 ? 8017 : me.f.durability > 0.6 ? 8299 : 8014],
  ],
  Domination: (me, foe) => [
    [me.f.cc > 0.5 ? 8126 : me.f.mobility > 0.6 ? 8143 : 8139],
    [8137],
    [me.f.roam > 0.6 ? 8105 : foe.f.durability > 0.7 ? 8135 : 8106],
  ],
  Sorcery: (me, foe) => [
    [me.resource === 'Mana' ? 8226 : me.f.mobility > 0.6 ? 8275 : 8224],
    [me.f.poke > 0.6 ? 8233 : me.f.roam > 0.6 ? 8234 : 8210],
    [me.f.scaling > 0.7 ? 8236 : foe.f.durability > 0.7 ? 8232 : 8237],
  ],
  Resolve: (me, foe) => [
    [me.f.splitpush > 0.55 ? 8446 : me.f.peel > 0.7 ? 8401 : 8463],
    [foe.f.poke > 0.55 || foe.range - me.range > 150 ? 8444 : 8473],
    [foe.f.cc > 0.7 ? 8242 : me.f.peel > 0.7 ? 8453 : 8451],
  ],
  Inspiration: (me, foe) => [
    [me.resource === 'Mana' ? 8304 : 8306],
    [foe.f.poke > 0.5 ? 8345 : 8313],
    [8347],
  ],
}

const WHY_RUNE: Record<number, string> = {
  8009: 'refunds mana every takedown so you can keep spending abilities in lane',
  9111: 'the extra health on a takedown is what turns a close all-in into a win',
  9101: 'free healing off minions keeps you in lane through chip damage',
  9104: 'attack speed scaling for a champion that wins by attacking more',
  9103: 'lifesteal scaling to hold the lane without recalling',
  9105: 'ability haste so your rotation is up more often',
  8017: 'percent health damage — the enemy builds health, this cuts through it',
  8299: 'you fight at low health, so the damage bonus is close to permanent',
  8014: 'execute damage for the kill threshold on a squishy lane',
  8126: 'your crowd control already lands, this makes it hurt',
  8143: 'your dash into a target becomes extra damage immediately',
  8139: 'healing on every trade in a melee lane',
  8137: 'vision on the enemy jungler before they reach your lane',
  8105: 'move speed after takedowns, which is how you keep roaming',
  8135: 'gold on takedowns to reach your item spike first',
  8106: 'lower ultimate cooldown, your main source of pressure',
  8226: 'mana sustain so your lane is not decided by your mana bar',
  8275: 'move speed after your ultimate to get out of the fight you started',
  8224: 'a shield against the first magic damage you take',
  8233: 'bonus damage while you are healthy, which is the poke pattern',
  8234: 'move speed while you are already moving, for roams',
  8210: 'ability haste that scales as the game goes on',
  8236: 'free scaling that pays off in every game past twenty minutes',
  8232: 'move speed near the river for objective fights',
  8237: 'burn damage on every poke you land',
  8446: 'turret damage — you intend to take the side lane and the plates',
  8401: 'your shields become damage',
  8463: 'healing for your team whenever you take damage in a fight',
  8444: 'regen against poke, the single best rune into a chip-damage lane',
  8473: 'reduces the damage of the opening burst, which is when you would die',
  8242: 'tenacity for a lane full of crowd control',
  8453: 'stronger shields and heals on low-health targets',
  8451: 'health scaling for a long game',
  8304: 'free boots, which is the strongest early gold swing available',
  8306: 'a free flash over a wall when you need it',
  8345: 'biscuits for health and mana through a poke lane',
  8313: 'a free stopwatch, which is an answer to one all-in',
  8347: 'summoner spell haste, more flashes and more teleports',
}

function minors(style: StyleName, me: Champion, foe: Champion, lane: Lane): RunePick[] {
  return PRIMARY_MINORS[style](me, foe, lane).map(([id]) =>
    pick(id, WHY_RUNE[id] ?? 'the strongest option in this slot for your pattern'))
}

/* ------------------------------------------------------------ secondary tree */
/** Which slots of a tree are worth taking when it is your *secondary* tree. */
const SECONDARY_SLOTS: Record<StyleName, (me: Champion) => [number, number]> = {
  Resolve: () => [1, 2],            // the regen / damage-reduction half, not Demolish
  Precision: me => (me.f.dps > 0.7 ? [1, 2] : [0, 2]),
  Domination: () => [0, 2],
  Sorcery: () => [0, 2],
  Inspiration: () => [1, 2],
}

function chooseSecondary(me: Champion, foe: Champion, lane: Lane, primary: StyleName) {
  const e = foe.f
  const order: StyleName[] = []
  if (e.burst > 0.7 || e.allin > 0.75 || e.poke > 0.6) order.push('Resolve')
  if (me.class === 'marksman' || me.f.dps > 0.75) order.push('Precision')
  if (me.f.burst > 0.7 || me.f.roam > 0.6) order.push('Domination')
  if (me.resource === 'Mana' && me.f.poke > 0.5) order.push('Sorcery')
  order.push('Precision', 'Sorcery', 'Inspiration', 'Resolve', 'Domination')
  const style = order.find(s => s !== primary)!

  const slots = PRIMARY_MINORS[style](me, foe, lane)
  const [i, j] = SECONDARY_SLOTS[style](me)
  const ids = [slots[i][0], slots[j][0]]
  return { style, picks: ids.map(id => pick(id, WHY_RUNE[id] ?? 'strongest option in this slot')) }
}

/* -------------------------------------------------------------------- shards */
function chooseShards(me: Champion, foe: Champion): Shard[] {
  const offense = me.f.dps > 0.75 && me.class === 'marksman' ? 5005
    : me.class === 'battle_mage' || me.class === 'enchanter' ? 5007 : 5008
  const flex = me.f.roam > 0.65 || me.class === 'enchanter' ? 5010
    : me.f.durability > 0.7 ? 5001 : 5008
  const defense = foe.f.cc > 0.65 ? 5013 : me.f.scaling > 0.75 ? 5001 : 5011
  const why: Record<number, string> = {
    5005: 'attack speed, because your damage is auto-attacks',
    5007: 'ability haste, because your damage is spell rotations',
    5008: 'adaptive force, the default damage shard',
    5010: 'move speed, because you leave lane to make plays',
    5001: 'health scaling for a long game',
    5011: 'flat health, which is survivability now rather than later',
    5013: `tenacity, because ${foe.name} lands a lot of crowd control on you`,
  }
  return [offense, flex, defense].map(id => ({ id, name: SHARD_NAMES[id], why: why[id] }))
}

/* ---------------------------------------------------------------- extra tips */
function summoners(me: Champion, foe: Champion, lane: Lane): Tip[] {
  const out: Tip[] = [{ title: 'Flash', why: 'non-negotiable' }]
  if (lane === 'JNG') { out.push({ title: 'Smite', why: 'required for the role' }); return out }
  if (lane === 'ADC') {
    if (foe.f.cc > 0.75 && foe.tags.includes('pointclick'))
      out.push({ title: 'Cleanse', why: `${foe.name} lands crowd control you cannot dodge` })
    else if (foe.f.burst > 0.8) out.push({ title: 'Barrier', why: `survives ${foe.name}'s burst window` })
    else out.push({ title: 'Heal', why: 'standard, and it saves your support too' })
    return out
  }
  if (lane === 'SUP') {
    out.push(foe.f.burst > 0.7 || foe.f.allin > 0.75
      ? { title: 'Exhaust', why: `blunts ${foe.name}'s all-in and their jungler's dive` }
      : { title: 'Ignite', why: 'converts your lane pressure into a kill' })
    return out
  }
  if (lane === 'TOP') {
    out.push(me.f.allin > 0.8 && me.f.early > 0.6
      ? { title: 'Ignite', why: `you beat ${foe.name} early, so press it` }
      : { title: 'Teleport', why: 'stay even in lane and use it to affect the map' })
    return out
  }
  out.push(me.f.allin > 0.7 || me.f.burst > 0.75
    ? { title: 'Ignite', why: `gives you a kill threshold on ${foe.name}` }
    : { title: 'Teleport', why: 'for a scaling pattern and map pressure' })
  return out
}

function items(me: Champion, foe: Champion): Tip[] {
  const out: Tip[] = []
  if (foe.f.sustain > 0.6)
    out.push({ title: foe.damage === 'AP' || me.damage === 'AP' ? "Oblivion Orb / Morellonomicon" : "Executioner's Calling",
      why: `${foe.name} wins on healing — grievous wounds early is worth more than raw damage` })
  if (foe.damage === 'AD' && foe.f.dps > 0.7)
    out.push({ title: 'Plated Steelcaps', why: `${foe.name} deals repeated physical damage, armour and auto-attack reduction blunt it` })
  if (foe.damage === 'AP' || foe.f.burst > 0.8)
    out.push({ title: "Mercury's Treads", why: `magic resist and tenacity against ${foe.name}'s burst and crowd control` })
  if (foe.f.durability > 0.75)
    out.push({ title: 'A percent-max-health damage item', why: `${foe.name} builds health, flat damage will not be enough` })
  if (foe.f.mobility > 0.75)
    out.push({ title: 'A slow or an anti-dash tool', why: `${foe.name} escapes anything you cannot stick to` })
  if (!out.length) out.push({ title: 'Standard build', why: 'nothing in this matchup forces an early situational item' })
  return out
}

/* ---------------------------------------------------------------------- main */
export function buildRunePage(me: Champion, foe: Champion, lane: Lane): RunePage {
  const ks = chooseKeystone(me, foe, lane)
  const primary = minors(ks.style, me, foe, lane)
  const sec = chooseSecondary(me, foe, lane, ks.style)
  const shards = chooseShards(me, foe)
  const keystone = pick(ks.id, ks.why)

  const name = `LaneIQ ${me.name} v ${foe.name}`.slice(0, 24)
  return {
    name: `${me.name} vs ${foe.name}`,
    primaryStyle: ks.style,
    subStyle: sec.style,
    keystone,
    primary,
    secondary: sec.picks,
    shards,
    alternatives: ks.alts,
    summoners: summoners(me, foe, lane),
    items: items(me, foe),
    lcu: {
      name,
      primaryStyleId: STYLE[ks.style],
      subStyleId: STYLE[sec.style],
      selectedPerkIds: [
        keystone.id, ...primary.map(p => p.id),
        ...sec.picks.map(p => p.id),
        ...shards.map(s => s.id),
      ],
    },
  }
}
