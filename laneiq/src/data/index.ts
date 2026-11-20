import championsRaw from './champions.json'
import runesRaw from './runes.json'
import iconsRaw from './icons.json'
import type { Champion } from '../types'

export const PATCH: string = (championsRaw as any).patch
export const CHAMPIONS: Record<string, Champion> = (championsRaw as any).champions
export const CHAMPION_LIST: Champion[] = Object.values(CHAMPIONS).sort((a, b) =>
  a.name.localeCompare(b.name),
)

export interface RuneDef { id: number; key: string; name: string; icon: string; short: string }
export interface RuneTree { id: number; key: string; name: string; icon: string; slots: RuneDef[][] }
export const RUNE_TREES: Record<string, RuneTree> = (runesRaw as any).trees

export const DDRAGON = `https://ddragon.leagueoflegends.com/cdn/${PATCH}`

/**
 * Icons normally come straight from Data Dragon. A build that has to run
 * somewhere Riot's CDN is unreachable can inline them instead — see
 * scripts/build_icons.py. Empty by default.
 */
const LOCAL_ICONS = iconsRaw as { champions: Record<string, string>; runes: Record<string, string> }
export const ICONS_INLINED = Object.keys(LOCAL_ICONS.champions).length > 0

export const champIcon = (id: string) =>
  LOCAL_ICONS.champions[id] ?? `${DDRAGON}/img/champion/${id}.png`
export const runeIcon = (icon: string, id?: number | string) =>
  (id !== undefined && LOCAL_ICONS.runes[String(id)]) ||
  `https://ddragon.leagueoflegends.com/cdn/img/${icon}`

export const ALL_RUNES: Record<number, RuneDef & { tree: string }> = (() => {
  const out: Record<number, RuneDef & { tree: string }> = {}
  for (const tree of Object.values(RUNE_TREES))
    for (const slot of tree.slots) for (const r of slot) out[r.id] = { ...r, tree: tree.key }
  return out
})()

export const treeByKey = (key: string) => RUNE_TREES[key]
