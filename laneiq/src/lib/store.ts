import { useEffect, useState } from 'react'
import type { Lane, PoolEntry, Profile } from '../types'

const KEY = 'laneiq.profile.v1'

export const EMPTY_PROFILE: Profile = {
  name: '', region: 'EUW', rank: 'Unranked', mainLane: 'MID', pool: [], masteryWeight: 35,
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_PROFILE
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) }
  } catch { return EMPTY_PROFILE }
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(loadProfile)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(profile)) }, [profile])

  return {
    profile,
    setProfile,
    patch: (p: Partial<Profile>) => setProfile(v => ({ ...v, ...p })),
    addToPool: (id: string, lane: Lane) =>
      setProfile(v => v.pool.some(e => e.id === id && e.lane === lane) ? v
        : { ...v, pool: [...v.pool, { id, lane, games: 0, wins: 0, comfort: 3 }] }),
    removeFromPool: (id: string, lane: Lane) =>
      setProfile(v => ({ ...v, pool: v.pool.filter(e => !(e.id === id && e.lane === lane)) })),
    updateEntry: (id: string, lane: Lane, patch: Partial<PoolEntry>) =>
      setProfile(v => ({ ...v, pool: v.pool.map(e =>
        e.id === id && e.lane === lane ? { ...e, ...patch } : e) })),
    mergePool: (entries: PoolEntry[]) =>
      setProfile(v => {
        const pool = [...v.pool]
        for (const e of entries)
          if (!pool.some(x => x.id === e.id && x.lane === e.lane)) pool.push(e)
        return { ...v, pool }
      }),
  }
}

export const LANES: Lane[] = ['TOP', 'JNG', 'MID', 'ADC', 'SUP']
export const LANE_LABEL: Record<Lane, string> = {
  TOP: 'Top', JNG: 'Jungle', MID: 'Mid', ADC: 'Bot (ADC)', SUP: 'Support',
}
export const REGIONS = ['EUW', 'EUNE', 'NA', 'KR', 'BR', 'LAN', 'LAS', 'OCE', 'TR', 'RU', 'JP', 'VN']
export const RANKS = ['Unranked', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master+']
