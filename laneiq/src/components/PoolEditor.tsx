import { useState } from 'react'
import { CHAMPIONS, champIcon } from '../data'
import type { Lane, PoolEntry } from '../types'
import { LANES, LANE_LABEL } from '../lib/store'
import { ChampionSearch } from './ChampionSearch'

interface Props {
  pool: PoolEntry[]
  onAdd: (id: string, lane: Lane) => void
  onRemove: (id: string, lane: Lane) => void
  onUpdate: (id: string, lane: Lane, patch: Partial<PoolEntry>) => void
}

export function PoolEditor({ pool, onAdd, onRemove, onUpdate }: Props) {
  const [lane, setLane] = useState<Lane>('MID')
  const inLane = pool.filter(e => e.lane === lane)

  return (
    <div className="pool">
      <div className="lane-tabs">
        {LANES.map(l => (
          <button key={l} className={`lane-tab${lane === l ? ' active' : ''}`} onClick={() => setLane(l)}>
            {LANE_LABEL[l]}
            <span className="count">{pool.filter(e => e.lane === l).length}</span>
          </button>
        ))}
      </div>

      <div className="pool-list">
        {inLane.length === 0 && <p className="muted">No champions in your {LANE_LABEL[lane]} pool yet — add them below.</p>}
        {inLane.map(e => {
          const c = CHAMPIONS[e.id]
          if (!c) return null
          const wr = e.games ? Math.round((e.wins / e.games) * 100) : null
          return (
            <div className="pool-row" key={`${e.id}-${e.lane}`}>
              <img src={champIcon(e.id)} alt={c.name} />
              <div className="pool-name">
                <b>{c.name}</b>
                <span className="muted">{c.class.replace('_', ' ')} · {c.damage}</span>
              </div>
              <label className="num">
                <span>Games</span>
                <input type="number" min={0} value={e.games}
                  onChange={ev => onUpdate(e.id, e.lane, { games: Math.max(0, +ev.target.value || 0) })} />
              </label>
              <label className="num">
                <span>Wins</span>
                <input type="number" min={0} max={e.games} value={e.wins}
                  onChange={ev => onUpdate(e.id, e.lane, { wins: Math.max(0, Math.min(e.games, +ev.target.value || 0)) })} />
              </label>
              <div className="wr-chip">{wr === null ? '—' : `${wr}%`}</div>
              <div className="stars">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} className={`star${n <= e.comfort ? ' on' : ''}`}
                    title={`Comfort ${n}/5`}
                    onClick={() => onUpdate(e.id, e.lane, { comfort: n })}>★</button>
                ))}
              </div>
              <button className="btn btn-ghost" onClick={() => onRemove(e.id, e.lane)}>Remove</button>
            </div>
          )
        })}
      </div>

      <h4 className="section">Add to {LANE_LABEL[lane]}</h4>
      <ChampionSearch lane={lane} onPick={c => onAdd(c.id, lane)} placeholder={`Search a champion to add to ${LANE_LABEL[lane]}…`} />
    </div>
  )
}
