import { useState } from 'react'
import GroupsScreen from './components/GroupsScreen'
import FixturesScreen from './components/FixturesScreen'
import AnalysisScreen from './components/AnalysisScreen'

// screen: 'groups' | 'fixtures' | 'analysis'
export default function App() {
  const [screen, setScreen] = useState('groups')
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [selectedFixture, setSelectedFixture] = useState(null)

  function goGroups() {
    setScreen('groups')
    setSelectedTeam(null)
    setSelectedFixture(null)
  }

  function goFixtures() {
    setScreen('fixtures')
    setSelectedFixture(null)
  }

  function handleSelectTeam(team) {
    setSelectedTeam(team)
    setScreen('fixtures')
  }

  function handleSelectMatch(fixture) {
    setSelectedFixture(fixture)
    setScreen('analysis')
  }

  const breadcrumbs = [
    { label: 'Groups', onClick: goGroups, active: screen === 'groups' },
    ...(selectedTeam ? [{ label: selectedTeam.name, onClick: goFixtures, active: screen === 'fixtures' }] : []),
    ...(selectedFixture ? [{
      label: `${selectedFixture.home} vs ${selectedFixture.away}`,
      onClick: null,
      active: true,
    }] : []),
  ]

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <span className="topbar-logo" onClick={goGroups} style={{ cursor: 'pointer' }}>
          ⚽ WC 2026
        </span>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>
          Pre-Tournament Intelligence Dashboard
        </span>
        <span className="topbar-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'inline-block',
            animation: 'pulse 2s infinite',
          }} />
          Powered by RocketRide · GMI Cloud · Gemini
        </span>
      </div>

      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div className="breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span className="breadcrumb-sep">›</span>}
              <span
                className={`breadcrumb-item${b.active ? ' active' : ''}`}
                onClick={b.onClick || undefined}
              >
                {b.label}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Screens */}
      {screen === 'groups' && (
        <GroupsScreen onSelectTeam={handleSelectTeam} />
      )}
      {screen === 'fixtures' && selectedTeam && (
        <FixturesScreen
          team={selectedTeam}
          onSelectMatch={handleSelectMatch}
        />
      )}
      {screen === 'analysis' && selectedFixture && (
        <AnalysisScreen
          fixture={selectedFixture}
          team={selectedTeam}
        />
      )}
    </div>
  )
}
