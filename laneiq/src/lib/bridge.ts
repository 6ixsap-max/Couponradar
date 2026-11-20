/**
 * Talks to the local LaneIQ bridge (bridge/lcu_bridge.py), which is the only
 * thing that can reach the League client on this machine. Without it the app
 * still works — you just copy the rune page in by hand.
 */
export const BRIDGE_URL = 'http://127.0.0.1:7171'

export interface BridgeStatus {
  ok: boolean
  clientConnected: boolean
  summoner?: { name: string; level: number; puuid: string }
  error?: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BRIDGE_URL + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as any).error || `bridge returned ${res.status}`)
  return body as T
}

export async function ping(timeoutMs = 1500): Promise<BridgeStatus> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(BRIDGE_URL + '/health', { signal: ctl.signal })
    if (!r.ok) return { ok: false, clientConnected: false, error: `status ${r.status}` }
    return { ok: true, ...(await r.json()) }
  } catch (e) {
    return { ok: false, clientConnected: false, error: (e as Error).message }
  } finally { clearTimeout(timer) }
}

export interface MasteryEntry { championId: number; championLevel: number; championPoints: number }
export const fetchMastery = () => req<{ mastery: MasteryEntry[] }>('/mastery')

export interface ChampSelect {
  inChampSelect: boolean
  myPosition?: string
  myChampionId?: number
  enemyChampionIds: number[]
  bans: number[]
}
export const fetchChampSelect = () => req<ChampSelect>('/champselect')

export interface LcuPage {
  name: string; primaryStyleId: number; subStyleId: number; selectedPerkIds: number[]
}
export const applyRunes = (page: LcuPage) =>
  req<{ applied: boolean; pageId?: number }>('/runes', { method: 'POST', body: JSON.stringify(page) })
