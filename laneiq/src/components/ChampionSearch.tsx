import { useMemo, useState } from 'react'
import { CHAMPION_LIST, champIcon } from '../data'
import type { Champion, Lane } from '../types'

interface Props {
  lane?: Lane
  selected?: string
  onPick: (c: Champion) => void
  placeholder?: string
  autoFocus?: boolean
  limit?: number
}

export function ChampionSearch({ lane, selected, onPick, placeholder, autoFocus, limit = 60 }: Props) {
  const [q, setQ] = useState('')
  const [laneOnly, setLaneOnly] = useState(true)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return CHAMPION_LIST
      .filter(c => !lane || !laneOnly || c.lanes.includes(lane))
      .filter(c => !needle || c.name.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle))
      .slice(0, needle ? 40 : limit)
  }, [q, lane, laneOnly, limit])

  return (
    <div className="champ-search">
      <div className="search-row">
        <input
          className="input"
          value={q}
          autoFocus={autoFocus}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder ?? 'Search champion…'}
          onKeyDown={e => { if (e.key === 'Enter' && list[0]) { onPick(list[0]); setQ('') } }}
        />
        {lane && (
          <label className="toggle">
            <input type="checkbox" checked={laneOnly} onChange={e => setLaneOnly(e.target.checked)} />
            <span>{lane} only</span>
          </label>
        )}
      </div>
      <div className="champ-grid">
        {list.map(c => (
          <button
            key={c.id}
            className={`champ-tile${selected === c.id ? ' is-selected' : ''}`}
            onClick={() => onPick(c)}
            title={`${c.name} — ${c.title}`}
          >
            <img src={champIcon(c.id)} alt={c.name} loading="lazy" />
            <span>{c.name}</span>
          </button>
        ))}
        {!list.length && <p className="muted">No champion matches “{q}”.</p>}
      </div>
    </div>
  )
}
