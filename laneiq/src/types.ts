export type Lane = 'TOP' | 'JNG' | 'MID' | 'ADC' | 'SUP'
export type Damage = 'AD' | 'AP' | 'MIX'

export interface Features {
  poke: number; sustain: number; allin: number; scaling: number; early: number
  mobility: number; cc: number; durability: number; waveclear: number; burst: number
  dps: number; peel: number; engage: number; antitank: number; antimobile: number
  safety: number; splitpush: number; roam: number
}

export interface Spell { k: 'Q' | 'W' | 'E' | 'R'; n: string; cd: number; r: number }

export interface Champion {
  id: string
  passive: string
  spells: Spell[]
  key: number
  name: string
  title: string
  lanes: Lane[]
  class: string
  damage: Damage
  tags: string[]
  ddTags: string[]
  range: number
  melee: boolean
  difficulty: number
  resource: string
  f: Features
}

export interface PoolEntry {
  id: string          // champion id
  lane: Lane
  games: number
  wins: number
  comfort: number     // 1..5, self-rated
}

export interface Profile {
  name: string
  region: string
  rank: string
  mainLane: Lane
  pool: PoolEntry[]
  masteryWeight: number   // 0..100 — how much personal performance counts vs the matchup model
}

export interface Reason {
  text: string
  weight: number
  kind: 'good' | 'bad' | 'note'
}

export interface Pick {
  champion: Champion
  entry: PoolEntry
  winRate: number        // final estimate, %
  modelWinRate: number   // matchup model only, %
  comfortDelta: number   // contribution from your own history
  lanePhase: number      // -1..1
  teamfight: number      // -1..1
  confidence: 'low' | 'medium' | 'high'
  reasons: Reason[]
}
