import { useState } from 'react'
import { champIcon } from '../data'
import type { Champion, Lane, Pick } from '../types'
import { buildRunePage } from '../engine/runes'
import { buildGamePlan } from '../engine/gameplan'
import { RunePanel } from './RunePanel'
import { GamePlanPanel } from './GamePlanPanel'

const pct = (n: number) => `${n.toFixed(1)}%`

export function PickCard({ pick, foe, lane, rank, bridgeReady }: {
  pick: Pick; foe: Champion; lane: Lane; rank: number; bridgeReady: boolean
}) {
  const [open, setOpen] = useState(rank === 0)
  const good = pick.winRate >= 52, bad = pick.winRate < 48
  const tone = good ? 'good' : bad ? 'bad' : 'even'

  return (
    <div className={`pick card tone-${tone}${rank === 0 ? ' is-best' : ''}`}>
      <div className="pick-head" onClick={() => setOpen(o => !o)}>
        <div className="rank">{rank + 1}</div>
        <img className="portrait" src={champIcon(pick.champion.id)} alt={pick.champion.name} />
        <div className="pick-title">
          <h3>{pick.champion.name}{rank === 0 && <span className="badge">best pick</span>}</h3>
          <p className="muted">{pick.champion.title} · {pick.entry.games} games on record · comfort {pick.entry.comfort}/5</p>
        </div>
        <div className="wr">
          <div className="wr-num">{pct(pick.winRate)}</div>
          <div className="wr-label">projected</div>
        </div>
        <button className="chev" aria-label="toggle details">{open ? '−' : '+'}</button>
      </div>

      <div className="bars">
        <Bar label="Laning phase" v={pick.lanePhase} />
        <Bar label="Mid / late game" v={pick.teamfight} />
      </div>

      {open && (
        <div className="pick-body">
          <ul className="reasons">
            {pick.reasons.map((r, i) => (
              <li key={i} className={`reason ${r.kind}`}>
                <span className="dot" />{r.text}
              </li>
            ))}
          </ul>
          <div className="meta-row">
            <span>Matchup model alone: <b>{pct(pick.modelWinRate)}</b></span>
            <span>Your history moves it <b>{pick.comfortDelta >= 0 ? '+' : ''}{pick.comfortDelta.toFixed(1)}</b> points</span>
            <span>Confidence: <b className={`conf-${pick.confidence}`}>{pick.confidence}</b></span>
          </div>
          <GamePlanPanel plan={buildGamePlan(pick.champion, foe, lane)} me={pick.champion} foe={foe} />
          <RunePanel page={buildRunePage(pick.champion, foe, lane)} bridgeReady={bridgeReady} />
        </div>
      )}
    </div>
  )
}

function Bar({ label, v }: { label: string; v: number }) {
  const w = Math.abs(v) * 50
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-mid" />
        <div className={`bar-fill ${v >= 0 ? 'pos' : 'neg'}`}
             style={{ width: `${w}%`, left: v >= 0 ? '50%' : `${50 - w}%` }} />
      </div>
      <span className="bar-val">{v >= 0 ? '+' : ''}{(v * 100).toFixed(0)}</span>
    </div>
  )
}
