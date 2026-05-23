import { useState, useEffect } from 'react'
import { api } from '../api'

function TeamCrest({ src, name, size = 28 }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="team-crest-placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }}>
        {(name || '?')[0]}
      </div>
    )
  }
  return <img src={src} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} onError={() => setErr(true)} />
}

function stageLabel(stage) {
  if (!stage) return ''
  const map = {
    GROUP_STAGE: 'Group Stage',
    LAST_16: 'Round of 16',
    QUARTER_FINALS: 'Quarter-Final',
    SEMI_FINALS: 'Semi-Final',
    THIRD_PLACE: '3rd Place',
    FINAL: 'Final',
  }
  return map[stage] || stage.replace(/_/g, ' ')
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FixturesScreen({ team, onSelectMatch }) {
  const [fixtures, setFixtures] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getTeamFixtures(team.name)
      .then(setFixtures)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [team.name])

  if (loading) {
    return (
      <div className="screen">
        <div className="loading-wrap">
          <div className="spinner" />
          <span>Loading {team.name} fixtures…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen">
        <div className="error-box">Failed to load fixtures: {error}</div>
      </div>
    )
  }

  const grouped = {}
  for (const f of (fixtures || [])) {
    const key = f.stage || 'Other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(f)
  }

  return (
    <div className="screen">
      <div className="fixtures-header">
        <TeamCrest src={team.crest} name={team.name} size={48} />
        <div>
          <h1 className="screen-title">{team.name}</h1>
          <p className="screen-sub" style={{ marginBottom: 0 }}>
            {fixtures?.length || 0} fixtures — click a match to analyze
          </p>
        </div>
      </div>

      {Object.entries(grouped).map(([stage, matches]) => (
        <div key={stage} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text2)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 10,
            paddingBottom: 6,
            borderBottom: '1px solid var(--border)',
          }}>
            {stageLabel(stage)}
          </div>

          <div className="fixtures-list">
            {matches.map(fix => {
              const isHome = fix.home.toLowerCase().includes(team.name.toLowerCase())
              const opponent = isHome ? fix.away : fix.home
              const opponentCrest = isHome ? fix.away_crest : fix.home_crest

              return (
                <div
                  key={fix.id}
                  className="fixture-card"
                  onClick={() => onSelectMatch(fix)}
                >
                  <div className="fixture-top">
                    {fix.group && (
                      <span className="fixture-group-badge">Group {fix.group}</span>
                    )}
                    <span className="fixture-stage">{stageLabel(fix.stage)}</span>
                    <span className="fixture-date">{formatDate(fix.date)} · {fix.time} UTC</span>
                  </div>

                  <div className="fixture-teams">
                    <div className="fixture-team">
                      <TeamCrest src={fix.home_crest} name={fix.home} size={26} />
                      <span className={`fixture-team-name${fix.home.toLowerCase().includes(team.name.toLowerCase()) ? ' selected' : ''}`}>
                        {fix.home}
                      </span>
                    </div>
                    <span className="fixture-vs">VS</span>
                    <div className="fixture-team away">
                      <TeamCrest src={fix.away_crest} name={fix.away} size={26} />
                      <span className={`fixture-team-name${fix.away.toLowerCase().includes(team.name.toLowerCase()) ? ' selected' : ''}`}>
                        {fix.away}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {(!fixtures || fixtures.length === 0) && (
        <div className="error-box">No fixtures found for {team.name}.</div>
      )}
    </div>
  )
}
