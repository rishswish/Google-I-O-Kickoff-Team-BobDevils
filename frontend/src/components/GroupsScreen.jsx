import { useState, useEffect } from 'react'
import { api } from '../api'

function TeamCrest({ src, name, size = 28 }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="team-crest-placeholder" style={{ width: size, height: size }}>
        {(name || '?')[0]}
      </div>
    )
  }
  return (
    <img
      className="team-crest"
      src={src}
      alt={name}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}

export default function GroupsScreen({ onSelectTeam }) {
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getGroups()
      .then(setGroups)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="screen">
        <div className="loading-wrap">
          <div className="spinner" />
          <span>Loading World Cup 2026 groups…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen">
        <div className="error-box">Failed to load groups: {error}</div>
      </div>
    )
  }

  const groupEntries = groups ? Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)) : []

  return (
    <div className="screen">
      <h1 className="screen-title">FIFA World Cup 2026</h1>
      <p className="screen-sub">Select a team to view their fixtures and get AI-powered match analysis</p>

      <div className="groups-grid">
        {groupEntries.map(([groupKey, teams]) => (
          <div className="group-card" key={groupKey}>
            <div className="group-header">
              <span className="group-label">GROUP {groupKey}</span>
              <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
                {teams.length} teams
              </span>
            </div>
            {teams.map(team => (
              <div
                key={team.id || team.name}
                className="team-row"
                onClick={() => onSelectTeam(team)}
                title={`Click to see ${team.name} fixtures`}
              >
                <TeamCrest src={team.crest} name={team.name} />
                <span className="team-name">{team.name}</span>
                {team.tla && <span className="team-tla">{team.tla}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {groupEntries.length === 0 && (
        <div className="error-box">No groups data available.</div>
      )}
    </div>
  )
}
