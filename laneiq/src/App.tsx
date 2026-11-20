import { useEffect, useMemo, useState } from 'react'
import { CHAMPIONS, CHAMPION_LIST, PATCH, champIcon } from './data'
import type { Champion, Lane, PoolEntry } from './types'
import { bestInRoster, recommend } from './engine/matchup'
import { LANES, LANE_LABEL, RANKS, REGIONS, useProfile } from './lib/store'
import { ChampionSearch } from './components/ChampionSearch'
import { PickCard } from './components/PickCard'
import { PoolEditor } from './components/PoolEditor'
import * as bridge from './lib/bridge'

type Tab = 'pick' | 'pool' | 'profile'

export default function App() {
  const p = useProfile()
  const [tab, setTab] = useState<Tab>('pick')
  const [lane, setLane] = useState<Lane>(p.profile.mainLane)
  const [foeId, setFoeId] = useState<string>('')
  const [status, setStatus] = useState<bridge.BridgeStatus>({ ok: false, clientConnected: false })
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    const check = async () => { const s = await bridge.ping(); if (alive) setStatus(s) }
    check()
    const t = setInterval(check, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const foe = foeId ? CHAMPIONS[foeId] : undefined
  const picks = useMemo(
    () => (foe ? recommend(p.profile, foe.id, lane) : []),
    [p.profile, foe, lane],
  )
  const poolIds = useMemo(() => new Set(p.profile.pool.filter(e => e.lane === lane).map(e => e.id)), [p.profile.pool, lane])
  const learn = useMemo(() => (foe ? bestInRoster(foe.id, lane, poolIds, 5) : []), [foe, lane, poolIds])
  const laneCount = p.profile.pool.filter(e => e.lane === lane).length

  async function pullChampSelect() {
    setNote('')
    try {
      const cs = await bridge.fetchChampSelect()
      if (!cs.inChampSelect) { setNote('Not in champion select right now.'); return }
      if (cs.myPosition) {
        const map: Record<string, Lane> = { top: 'TOP', jungle: 'JNG', middle: 'MID', bottom: 'ADC', utility: 'SUP' }
        const l = map[cs.myPosition.toLowerCase()]
        if (l) setLane(l)
      }
      const enemy = cs.enemyChampionIds.map(k => CHAMPION_LIST.find(c => c.key === k)).filter(Boolean) as Champion[]
      if (!enemy.length) { setNote('No enemy champion locked in yet.'); return }
      setFoeId(enemy[0].id)
      setNote(`Read from champion select: ${enemy.map(c => c.name).join(', ')}`)
    } catch (e) { setNote((e as Error).message) }
  }

  async function importMastery() {
    setNote('')
    try {
      const { mastery } = await bridge.fetchMastery()
      const entries: PoolEntry[] = mastery
        .slice(0, 15)
        .map(m => CHAMPION_LIST.find(c => c.key === m.championId))
        .filter(Boolean)
        .map(c => ({
          id: (c as Champion).id,
          lane: (c as Champion).lanes[0],
          games: 0,
          wins: 0,
          comfort: 3,
        }))
      p.mergePool(entries)
      setNote(`Added your top ${entries.length} mastery champions. Set games, wins and comfort so the model can use them.`)
      setTab('pool')
    } catch (e) { setNote((e as Error).message) }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">LaneIQ</span>
          <span className="patch">patch {PATCH}</span>
        </div>
        <nav className="tabs">
          <button className={tab === 'pick' ? 'active' : ''} onClick={() => setTab('pick')}>Counter pick</button>
          <button className={tab === 'pool' ? 'active' : ''} onClick={() => setTab('pool')}>My pool<span className="count">{p.profile.pool.length}</span></button>
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>Profile</button>
        </nav>
        <div className={`bridge-pill ${status.ok ? (status.clientConnected ? 'on' : 'half') : 'off'}`}
             title={status.error ?? ''}>
          <span className="pulse" />
          {status.ok ? (status.clientConnected ? `Client connected${status.summoner ? ` · ${status.summoner.name}` : ''}` : 'Bridge up, League closed') : 'Bridge offline'}
        </div>
      </header>

      {note && <div className="note">{note}<button onClick={() => setNote('')}>×</button></div>}

      {tab === 'pick' && (
        <main className="main">
          <section className="panel">
            <div className="panel-head">
              <h2>Who are you laning against?</h2>
              {status.clientConnected && (
                <button className="btn" onClick={pullChampSelect}>Read from champion select</button>
              )}
            </div>
            <div className="lane-tabs">
              {LANES.map(l => (
                <button key={l} className={`lane-tab${lane === l ? ' active' : ''}`} onClick={() => setLane(l)}>
                  {LANE_LABEL[l]}<span className="count">{p.profile.pool.filter(e => e.lane === l).length}</span>
                </button>
              ))}
            </div>
            {foe ? (
              <div className="foe-selected">
                <img src={champIcon(foe.id)} alt={foe.name} />
                <div>
                  <h3>{foe.name}</h3>
                  <p className="muted">{foe.title} · {foe.class.replace('_', ' ')} · {foe.damage} damage · {foe.melee ? 'melee' : `${foe.range} range`}</p>
                </div>
                <button className="btn btn-ghost" onClick={() => setFoeId('')}>Change</button>
              </div>
            ) : (
              <ChampionSearch lane={lane} selected={foeId} autoFocus onPick={c => setFoeId(c.id)}
                placeholder={`Search the enemy ${LANE_LABEL[lane]} champion…`} />
            )}
          </section>

          {foe && (
            <section className="panel">
              <div className="panel-head">
                <h2>Best picks from your pool</h2>
                <label className="slider">
                  <span>Weight my own results</span>
                  <input type="range" min={0} max={100} value={p.profile.masteryWeight}
                    onChange={e => p.patch({ masteryWeight: +e.target.value })} />
                  <b>{p.profile.masteryWeight}%</b>
                </label>
              </div>

              {laneCount === 0 ? (
                <div className="empty">
                  <p>Your {LANE_LABEL[lane]} pool is empty, so there is nothing to rank.</p>
                  <button className="btn btn-primary" onClick={() => setTab('pool')}>Build your pool</button>
                </div>
              ) : (
                <div className="picks">
                  {picks.map((pick, i) => (
                    <PickCard key={`${pick.champion.id}-${pick.entry.lane}`} pick={pick} foe={foe}
                      lane={lane} rank={i} bridgeReady={status.clientConnected} />
                  ))}
                </div>
              )}

              {!!learn.length && (
                <div className="learn">
                  <h4>Not in your pool, but strong into {foe.name}</h4>
                  <div className="learn-row">
                    {learn.map(l => (
                      <button key={l.champion.id} className="learn-chip"
                        onClick={() => { p.addToPool(l.champion.id, lane); setNote(`${l.champion.name} added to your ${LANE_LABEL[lane]} pool.`) }}>
                        <img src={champIcon(l.champion.id)} alt={l.champion.name} />
                        <span>{l.champion.name}</span>
                        <b>{l.modelWinRate.toFixed(1)}%</b>
                      </button>
                    ))}
                  </div>
                  <p className="muted small">Model estimate with no personal history — click to add to your pool.</p>
                </div>
              )}
            </section>
          )}
        </main>
      )}

      {tab === 'pool' && (
        <main className="main">
          <section className="panel">
            <div className="panel-head">
              <h2>Champion pool</h2>
              {status.clientConnected && <button className="btn" onClick={importMastery}>Import top mastery from client</button>}
            </div>
            <p className="muted">
              Games, wins and comfort are what separate this from a generic tier list. The more honest they are,
              the better the ranking gets.
            </p>
            <PoolEditor pool={p.profile.pool} onAdd={p.addToPool} onRemove={p.removeFromPool} onUpdate={p.updateEntry} />
          </section>
        </main>
      )}

      {tab === 'profile' && (
        <main className="main">
          <section className="panel narrow">
            <h2>Profile</h2>
            <label className="field"><span>Summoner name</span>
              <input className="input" value={p.profile.name} onChange={e => p.patch({ name: e.target.value })} placeholder="Your name" />
            </label>
            <label className="field"><span>Region</span>
              <select className="input" value={p.profile.region} onChange={e => p.patch({ region: e.target.value })}>
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="field"><span>Rank</span>
              <select className="input" value={p.profile.rank} onChange={e => p.patch({ rank: e.target.value })}>
                {RANKS.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="field"><span>Main lane</span>
              <select className="input" value={p.profile.mainLane}
                onChange={e => { p.patch({ mainLane: e.target.value as Lane }); setLane(e.target.value as Lane) }}>
                {LANES.map(l => <option key={l} value={l}>{LANE_LABEL[l]}</option>)}
              </select>
            </label>
            <label className="field"><span>Weight my own results ({p.profile.masteryWeight}%)</span>
              <input type="range" min={0} max={100} value={p.profile.masteryWeight}
                onChange={e => p.patch({ masteryWeight: +e.target.value })} />
            </label>
            <p className="muted small">
              0% ranks purely on the matchup model. 100% leans hard on your own record, which is the right
              setting once you have thirty or more games on most of your pool.
            </p>
            <div className="row">
              <button className="btn" onClick={() => {
                const blob = new Blob([JSON.stringify(p.profile, null, 2)], { type: 'application/json' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob); a.download = 'laneiq-profile.json'; a.click()
              }}>Export profile</button>
              <label className="btn">Import profile
                <input type="file" accept="application/json" hidden onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return
                  try { p.setProfile(JSON.parse(await f.text())); setNote('Profile imported.') }
                  catch { setNote('That file was not a LaneIQ profile.') }
                }} />
              </label>
              <button className="btn btn-ghost" onClick={() => { if (confirm('Clear your profile and pool?')) p.setProfile({ ...p.profile, pool: [] }) }}>
                Clear pool
              </button>
            </div>
          </section>

          <section className="panel narrow">
            <h2>How the recommendation works</h2>
            <ul className="explain">
              <li><b>Matchup model.</b> Every champion carries a feature vector — poke, sustain, all-in, crowd control, mobility, durability, wave clear, scaling and more — derived from its class, its kit and its live stats on patch {PATCH}. The model compares your champion against the enemy on thirteen weighted terms, weighted differently per lane.</li>
              <li><b>Known matchup patterns.</b> A curated list of lane dynamics the numbers cannot see, such as a spell shield blanking a hook, is applied on top.</li>
              <li><b>Your own record.</b> Your win rate is shrunk toward 50% so a three-game sample does not dominate, then blended in at the weight you choose.</li>
              <li><b>What it is not.</b> These are not scraped live win rates from a stats site. They are a model with its reasoning shown, so you can disagree with any line of it.</li>
            </ul>
          </section>
        </main>
      )}

      <footer className="foot">
        LaneIQ is not endorsed by Riot Games. Champion and rune data from Data Dragon, patch {PATCH}.
        Your profile stays in this browser.
      </footer>
    </div>
  )
}
