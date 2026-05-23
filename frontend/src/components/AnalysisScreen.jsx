import { useState, useEffect, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../api'

// ── Small helpers ─────────────────────────────────────────────────────────────
function TeamCrest({ src, name, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="team-crest-placeholder" style={{ width: size, height: size, fontSize: size * 0.35 }}>
        {(name || '?')[0]}
      </div>
    )
  }
  return <img src={src} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} onError={() => setErr(true)} />
}

function stageLabel(stage) {
  const map = {
    GROUP_STAGE: 'Group Stage', LAST_16: 'Round of 16',
    QUARTER_FINALS: 'Quarter-Final', SEMI_FINALS: 'Semi-Final',
    THIRD_PLACE: '3rd Place', FINAL: 'Final',
  }
  return map[stage] || (stage || '').replace(/_/g, ' ')
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Formation Pitch SVG ──────────────────────────────────────────────────────
const POSITIONS_433 = {
  GK:  { x: 0.5,  y: 0.92 },
  RB:  { x: 0.82, y: 0.75 },
  CB1: { x: 0.62, y: 0.79 },
  CB2: { x: 0.38, y: 0.79 },
  LB:  { x: 0.18, y: 0.75 },
  CDM: { x: 0.5,  y: 0.60 },
  CM1: { x: 0.72, y: 0.50 },
  CM2: { x: 0.28, y: 0.50 },
  RW:  { x: 0.85, y: 0.28 },
  ST:  { x: 0.5,  y: 0.20 },
  LW:  { x: 0.15, y: 0.28 },
}
const POSITIONS_4231 = {
  GK:  { x: 0.5,  y: 0.92 },
  RB:  { x: 0.82, y: 0.75 },
  CB1: { x: 0.62, y: 0.79 },
  CB2: { x: 0.38, y: 0.79 },
  LB:  { x: 0.18, y: 0.75 },
  CDM1:{ x: 0.62, y: 0.60 },
  CDM2:{ x: 0.38, y: 0.60 },
  CAM: { x: 0.5,  y: 0.44 },
  RW:  { x: 0.80, y: 0.28 },
  ST:  { x: 0.5,  y: 0.18 },
  LW:  { x: 0.20, y: 0.28 },
}

function getPositionMap(lineup) {
  if (!lineup || lineup.length < 11) return POSITIONS_433
  const keys = Object.keys(POSITIONS_433)
  const result = {}
  keys.forEach((k, i) => { result[lineup[i] || k] = POSITIONS_433[k] })
  return result
}

function FormationPitch({ formation, lineup, color, teamName }) {
  const positions = getPositionMap(lineup)
  const W = 220, H = 340

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
      {/* Pitch background */}
      <rect width={W} height={H} fill="#1a2e1a" rx="6" />
      {/* Grass stripes */}
      {[0,1,2,3,4,5].map(i => (
        <rect key={i} x={0} y={i*(H/6)} width={W} height={H/12} fill="rgba(255,255,255,0.015)" />
      ))}
      {/* Outer border */}
      <rect x={8} y={8} width={W-16} height={H-16} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} rx={3} />
      {/* Center line */}
      <line x1={8} y1={H/2} x2={W-8} y2={H/2} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      {/* Center circle */}
      <circle cx={W/2} cy={H/2} r={28} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      {/* Center spot */}
      <circle cx={W/2} cy={H/2} r={2} fill="rgba(255,255,255,0.3)" />
      {/* Penalty areas */}
      <rect x={W*0.25} y={8} width={W*0.5} height={H*0.16} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <rect x={W*0.25} y={H-8-H*0.16} width={W*0.5} height={H*0.16} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      {/* Goal areas */}
      <rect x={W*0.37} y={8} width={W*0.26} height={H*0.07} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <rect x={W*0.37} y={H-8-H*0.07} width={W*0.26} height={H*0.07} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

      {/* Formation label */}
      <text x={W/2} y={H-4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.4)" fontFamily="monospace">
        {formation}
      </text>

      {/* Players */}
      {Object.entries(positions).map(([pos, { x, y }]) => {
        const px = x * W
        const py = y * H
        return (
          <g key={pos} transform={`translate(${px},${py})`}>
            <circle r={11} fill={color} opacity={0.9} />
            <circle r={11} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
            <text textAnchor="middle" dy={4} fontSize={7} fill="#fff" fontWeight="bold" fontFamily="sans-serif">
              {pos.replace(/\d/, '')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Win Probability Donut ─────────────────────────────────────────────────────
const PIE_COLORS = ['#00ff87', '#ffaa00', '#ff4466']

function WinProbChart({ probabilities, team1, team2 }) {
  const probs = probabilities || { team1_win: 40, draw: 25, team2_win: 35 }
  const data = [
    { name: team1, value: probs.team1_win || 0 },
    { name: 'Draw', value: probs.draw || 0 },
    { name: team2, value: probs.team2_win || 0 },
  ]

  return (
    <div className="prob-chart-wrap">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={42}
            outerRadius={62}
            paddingAngle={2}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
            formatter={(val) => [`${val}%`]}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="prob-legend">
        {data.map((d, i) => (
          <div className="prob-legend-item" key={i}>
            <div className="prob-dot" style={{ background: PIE_COLORS[i] }} />
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>{d.name}</span>
            <span className="prob-val" style={{ color: PIE_COLORS[i], marginLeft: 6 }}>{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── H2H bars ──────────────────────────────────────────────────────────────────
function H2HBars({ wcHistory, team1, team2 }) {
  const t1 = wcHistory?.team1 || []
  const t2 = wcHistory?.team2 || []

  const stats = (records) => ({
    W: records.filter(r => r.result === 'W').length,
    D: records.filter(r => r.result === 'D').length,
    L: records.filter(r => r.result === 'L').length,
    total: records.length,
  })

  const s1 = stats(t1)
  const s2 = stats(t2)
  const maxTotal = Math.max(s1.total, s2.total, 1)

  return (
    <div>
      {[[team1, s1], [team2, s2]].map(([name, s]) => (
        <div key={name} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
            {name} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>({s.total} WC matches)</span>
          </div>
          {[['W', '#00ff87'], ['D', '#ffaa00'], ['L', '#ff4466']].map(([label, color]) => (
            <div className="h2h-bar-row" key={label}>
              <span className="h2h-bar-label">{label === 'W' ? 'Wins' : label === 'D' ? 'Draws' : 'Losses'}</span>
              <div className="h2h-bar-track">
                <div
                  className="h2h-bar-fill"
                  style={{
                    width: `${s.total ? (s[label] / maxTotal) * 100 : 0}%`,
                    background: color,
                  }}
                />
              </div>
              <span className="h2h-bar-val" style={{ color }}>{s[label]}</span>
            </div>
          ))}
        </div>
      ))}
      {s1.total === 0 && s2.total === 0 && (
        <p style={{ color: 'var(--text2)', fontSize: 12 }}>No recent WC data available for these teams.</p>
      )}
    </div>
  )
}

// ── WC Form badges ────────────────────────────────────────────────────────────
function FormBadges({ wcHistory, team1, team2 }) {
  const t1 = wcHistory?.team1 || []
  const t2 = wcHistory?.team2 || []

  const last5 = (records) => records.slice(-5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[[team1, t1], [team2, t2]].map(([name, records]) => (
        <div className="form-row" key={name}>
          <span className="form-team" style={{ fontSize: 11 }} title={name}>
            {name.split(' ').pop()}
          </span>
          <div className="form-badges">
            {last5(records).length > 0
              ? last5(records).map((r, i) => (
                  <div key={i} className={`badge ${r.result}`} title={`vs ${r.opponent} ${r.score}`}>
                    {r.result}
                  </div>
                ))
              : <span style={{ color: 'var(--text2)', fontSize: 11 }}>No data</span>
            }
          </div>
          {records.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 4 }}>
              WC {[...new Set(records.map(r => r.season))].join('/')}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Agent Steps progress ──────────────────────────────────────────────────────
function AgentSteps({ steps }) {
  return (
    <div className="agent-steps">
      <div className="agent-steps-title">AI Pipeline — Powered by RocketRide + GMI Cloud</div>
      {steps.map(s => (
        <div className="agent-step" key={s.step}>
          <div className={`step-icon ${s.status}`}>
            {s.status === 'done' ? '✓' : s.status === 'running' ? '●' : s.step}
          </div>
          <span className="step-name">
            <b>Step {s.step}</b> — {s.name}
          </span>
          {s.result && <span className="step-result">{s.result}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Chat Panel ────────────────────────────────────────────────────────────────
const SUGGESTED_QUESTIONS = [
  'Who are the key players to watch?',
  'What formation will likely win this match?',
  'How have they performed in knockout stages?',
  'What is the predicted scoreline?',
]

function ChatPanel({ team1, team2, initialMessage }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (initialMessage) {
      setMessages([{ role: 'assistant', content: initialMessage, ts: now() }])
    }
  }, [initialMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function now() {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  async function send(text) {
    const q = text || input.trim()
    if (!q) return
    setInput('')
    const userMsg = { role: 'user', content: q, ts: now() }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setLoading(true)
    try {
      const historyForApi = newHistory.map(m => ({ role: m.role, content: m.content }))
      const resp = await api.chat(team1, team2, q, historyForApi.slice(0, -1))
      setMessages(prev => [...prev, { role: 'assistant', content: resp.answer, ts: now() }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I could not process that. Please try again.',
        ts: now()
      }])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-dot" />
        <div>
          <div className="chat-title">AI Match Analyst</div>
          <div className="chat-sub">Ask anything about {team1} vs {team2}</div>
        </div>
      </div>

      <div className="suggested-qs">
        {SUGGESTED_QUESTIONS.map(q => (
          <button key={q} className="suggested-q" onClick={() => send(q)}>{q}</button>
        ))}
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
            <span className="chat-timestamp">{m.ts}</span>
          </div>
        ))}

        {loading && (
          <div className="chat-msg assistant">
            <div className="chat-bubble">
              <div className="chat-typing">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-wrap">
        <textarea
          className="chat-input"
          placeholder="Ask about tactics, players, predictions…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={loading}
        />
        <button className="chat-send" onClick={() => send()} disabled={loading || !input.trim()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Main Analysis Screen ──────────────────────────────────────────────────────
export default function AnalysisScreen({ fixture, team }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [steps, setSteps] = useState([
    { step: 1, name: 'Fetching head-to-head history', status: 'pending' },
    { step: 2, name: 'Analyzing World Cup history 2018 + 2022', status: 'pending' },
    { step: 3, name: 'Loading player data', status: 'pending' },
    { step: 4, name: 'Running prediction model via GMI Cloud (RocketRide)', status: 'pending' },
    { step: 5, name: 'Generating tactical analysis via GMI Cloud', status: 'pending' },
    { step: 6, name: 'Generating formation recommendations via GMI Cloud', status: 'pending' },
    { step: 7, name: 'Compiling intelligence dashboard', status: 'pending' },
  ])

  const team1 = fixture.home
  const team2 = fixture.away

  useEffect(() => {
    // Animate steps while loading
    let stepIdx = 0
    const interval = setInterval(() => {
      if (stepIdx < 7) {
        setSteps(prev => prev.map((s, i) => {
          if (i < stepIdx) return { ...s, status: 'done' }
          if (i === stepIdx) return { ...s, status: 'running' }
          return s
        }))
        stepIdx++
      }
    }, 800)

    api.analyze(team1, team2)
      .then(data => {
        clearInterval(interval)
        setSteps(data.agent_steps || steps.map(s => ({ ...s, status: 'done' })))
        setAnalysis(data)
      })
      .catch(e => {
        clearInterval(interval)
        setError(e.message)
      })
      .finally(() => setLoading(false))

    return () => clearInterval(interval)
  }, [team1, team2])

  const initialMessage = analysis
    ? `I've analyzed the ${team1} vs ${team2} match using historical data and AI modeling. ` +
      `My prediction: **${team1} ${analysis.prediction?.probabilities?.team1_win || '?'}%** win probability ` +
      `vs **${team2} ${analysis.prediction?.probabilities?.team2_win || '?'}%**, with a **${analysis.prediction?.predicted_score || '?'}** predicted scoreline. ` +
      `What would you like to know about this match?`
    : null

  return (
    <div className="screen" style={{ padding: '16px 24px' }}>
      {/* Match Header */}
      <div className="match-header">
        <div className="match-team">
          <TeamCrest src={fixture.home_crest} name={team1} size={48} />
          <span className="match-team-name">{team1}</span>
        </div>
        <div className="match-vs-block">
          <span className="match-vs">
            {stageLabel(fixture.stage)} · {fixture.group ? `Group ${fixture.group}` : ''}
          </span>
          {analysis?.prediction?.predicted_score && (
            <span className="predicted-score">{analysis.prediction.predicted_score}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {formatDate(fixture.date)} · {fixture.time} UTC
          </span>
        </div>
        <div className="match-team away">
          <TeamCrest src={fixture.away_crest} name={team2} size={48} />
          <span className="match-team-name">{team2}</span>
        </div>
      </div>

      {/* Agent Steps */}
      {(loading || analysis) && <AgentSteps steps={loading ? steps : (analysis?.agent_steps || steps)} />}

      {error && <div className="error-box" style={{ marginBottom: 20 }}>Analysis error: {error}</div>}

      {/* Main 2-column layout */}
      <div className="analysis-layout">
        {/* Left: Visualizations */}
        <div className="viz-panels">

          {/* Win Probability */}
          <div className="panel">
            <div className="panel-title">Win Probability</div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <div className="spinner" />
              </div>
            ) : (
              <WinProbChart
                probabilities={analysis?.prediction?.probabilities}
                team1={team1}
                team2={team2}
              />
            )}
          </div>

          {/* Formations (side by side) */}
          <div className="panel">
            <div className="panel-title">Tactical Formations</div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <div className="spinner" />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { name: team1, formation: analysis?.formations?.team1_formation, lineup: analysis?.formations?.team1_lineup, style: analysis?.formations?.team1_style, color: '#00ff87' },
                  { name: team2, formation: analysis?.formations?.team2_formation, lineup: analysis?.formations?.team2_lineup, style: analysis?.formations?.team2_style, color: '#00c4ff' },
                ].map(t => (
                  <div key={t.name}>
                    <div style={{ textAlign: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{t.name.split(' ').slice(-1)[0]}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{t.formation}</span>
                    </div>
                    <div style={{ height: 220 }}>
                      <FormationPitch
                        formation={t.formation || '4-3-3'}
                        lineup={t.lineup}
                        color={t.color}
                        teamName={t.name}
                      />
                    </div>
                    {t.style && (
                      <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, color: 'var(--text2)' }}>
                        Style: <span style={{ color: t.color, fontWeight: 600 }}>{t.style}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WC History */}
          <div className="panel">
            <div className="panel-title">World Cup Record (2018 + 2022)</div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <div className="spinner" />
              </div>
            ) : (
              <>
                <H2HBars wcHistory={analysis?.wc_history} team1={team1} team2={team2} />
                <div style={{ marginTop: 14 }}>
                  <div className="panel-title" style={{ marginBottom: 10 }}>Recent WC Form</div>
                  <FormBadges wcHistory={analysis?.wc_history} team1={team1} team2={team2} />
                </div>
              </>
            )}
          </div>

          {/* Tactical Analysis */}
          {analysis?.tactical_analysis && (
            <div className="panel">
              <div className="panel-title">Tactical Preview</div>
              <p className="tactical-text">{analysis.tactical_analysis}</p>
              {analysis.prediction?.key_battle && (
                <div className="key-battle">
                  <span style={{ fontSize: 16 }}>⚔️</span>
                  <div>
                    <div className="key-battle-label">Key Battle</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{analysis.prediction.key_battle}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Key Factors + Strengths */}
          {analysis?.prediction && (
            <div className="panel">
              <div className="panel-title">Key Factors</div>
              <div className="factors-list">
                {(analysis.prediction.key_factors || []).map((f, i) => (
                  <div className="factor-item" key={i}>
                    <div className="factor-dot" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              {(analysis.prediction.team1_strengths || analysis.prediction.team2_strengths) && (
                <div className="strengths-grid" style={{ marginTop: 14 }}>
                  <div>
                    <div className="strengths-col-title" style={{ color: '#00ff87' }}>{team1}</div>
                    {(analysis.prediction.team1_strengths || []).map((s, i) => (
                      <div className="strength-item" key={i}>{s}</div>
                    ))}
                  </div>
                  <div>
                    <div className="strengths-col-title" style={{ color: '#00c4ff' }}>{team2}</div>
                    {(analysis.prediction.team2_strengths || []).map((s, i) => (
                      <div className="strength-item" key={i}>{s}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Chat */}
        <ChatPanel
          team1={team1}
          team2={team2}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  )
}
