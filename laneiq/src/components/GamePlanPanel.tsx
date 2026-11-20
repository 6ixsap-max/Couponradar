import { useState } from 'react'
import type { Champion } from '../types'
import type { GamePlan } from '../engine/gameplan'

export function GamePlanPanel({ plan, me, foe }: { plan: GamePlan; me: Champion; foe: Champion }) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no')

  const asText = () => [
    `${me.name} vs ${foe.name} — ${plan.archetype}`,
    '',
    plan.thesis,
    '',
    ...plan.phases.map(p => `${p.label}: ${p.text}`),
    '',
    `Wave: ${plan.wave}`,
    `Trading: ${plan.trading}`,
    '',
    'Respect:',
    ...plan.respect.map(r => `  - ${r}`),
    '',
    `You win by: ${plan.winCondition}`,
    `You lose by: ${plan.lossCondition}`,
  ].join('\n')

  return (
    <div className="plan">
      <div className="plan-head">
        <h4>How to play the lane</h4>
        <span className="archetype">{plan.archetype}</span>
        <button className="btn btn-ghost" onClick={() => {
          navigator.clipboard.writeText(asText())
            .then(() => setCopied('yes'))
            .catch(() => setCopied('failed'))
            .finally(() => setTimeout(() => setCopied('no'), 2000))
        }}>{copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy blocked' : 'Copy plan'}</button>
      </div>

      <p className="thesis">{plan.thesis}</p>

      <ol className="phases">
        {plan.phases.map(p => (
          <li key={p.label}>
            <span className="phase-label">{p.label}</span>
            <p>{p.text}</p>
          </li>
        ))}
      </ol>

      <div className="plan-grid">
        <div className="plan-box">
          <h5>Wave management</h5>
          <p>{plan.wave}</p>
        </div>
        <div className="plan-box">
          <h5>When to trade</h5>
          <p>{plan.trading}</p>
        </div>
      </div>

      <div className="plan-box">
        <h5>Respect</h5>
        <ul className="respect">{plan.respect.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>

      <div className="conditions">
        <div className="cond win"><b>You win by</b><span>{plan.winCondition}</span></div>
        <div className="cond lose"><b>You lose by</b><span>{plan.lossCondition}</span></div>
      </div>
    </div>
  )
}
