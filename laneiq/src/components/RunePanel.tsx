import { useState } from 'react'
import { runeIcon } from '../data'
import type { RunePage } from '../engine/runes'
import { applyRunes } from '../lib/bridge'

const HOSTED = typeof location !== 'undefined' &&
  !['localhost', '127.0.0.1', ''].includes(location.hostname)

export function RunePanel({ page, bridgeReady }: { page: RunePage; bridgeReady: boolean }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function send() {
    setState('sending'); setMsg('')
    try { await applyRunes(page.lcu); setState('done'); setMsg(`Page "${page.lcu.name}" is now selected in your client.`) }
    catch (e) { setState('error'); setMsg((e as Error).message) }
  }

  const copy = () => navigator.clipboard.writeText(JSON.stringify(page.lcu, null, 2))

  return (
    <div className="runes">
      <div className="runes-head">
        <h4>Runes for this matchup</h4>
        <div className="runes-actions">
          <button className="btn btn-primary" onClick={send} disabled={!bridgeReady || state === 'sending'}>
            {state === 'sending' ? 'Importing…' : 'Import into League client'}
          </button>
          <button className="btn" onClick={copy}>Copy page JSON</button>
        </div>
      </div>
      {!bridgeReady && (
        <p className="hint">
          {HOSTED
            ? <>This is the hosted preview, and a hosted page is not allowed to reach your own machine.
                One-click import works when you run LaneIQ locally with the bridge — everything below is
                the page to set up by hand in the meantime.</>
            : <>Start the local bridge (<code>npm run bridge</code>) with League open to import with one
                click. Until then the page below is the manual setup.</>}
        </p>
      )}
      {msg && <p className={state === 'error' ? 'err' : 'ok'}>{msg}</p>}

      <div className="rune-trees">
        <div className="rune-tree">
          <div className="tree-name">{page.primaryStyle}</div>
          <RuneRow r={page.keystone} keystone />
          {page.primary.map(r => <RuneRow key={r.id} r={r} />)}
        </div>
        <div className="rune-tree">
          <div className="tree-name">{page.subStyle}</div>
          {page.secondary.map(r => <RuneRow key={r.id} r={r} />)}
          <div className="shards">
            {page.shards.map((s, i) => (
              <div className="shard" key={`${s.id}-${i}`}>
                <b>{s.name}</b><span>{s.why}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tips">
        <div>
          <h5>Summoner spells</h5>
          <ul>{page.summoners.map(s => <li key={s.title}><b>{s.title}</b> — {s.why}</li>)}</ul>
        </div>
        <div>
          <h5>Build adjustments</h5>
          <ul>{page.items.map(s => <li key={s.title}><b>{s.title}</b> — {s.why}</li>)}</ul>
        </div>
        {!!page.alternatives.length && (
          <div>
            <h5>Alternative keystone</h5>
            <ul>{page.alternatives.map(a => <li key={a.name}><b>{a.name}</b> — {a.why}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  )
}

function RuneRow({ r, keystone }: { r: { id: number; name: string; icon: string; why: string }; keystone?: boolean }) {
  return (
    <div className={`rune-row${keystone ? ' is-keystone' : ''}`}>
      <img src={runeIcon(r.icon, r.id)} alt={r.name} loading="lazy" />
      <div>
        <b>{r.name}</b>
        <span>{r.why}</span>
      </div>
    </div>
  )
}
