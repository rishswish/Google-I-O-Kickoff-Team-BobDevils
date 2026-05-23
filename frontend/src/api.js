const BASE = 'http://localhost:8000'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  getGroups: () => get('/api/groups'),
  getTeamFixtures: (teamName) => get(`/api/fixtures/${encodeURIComponent(teamName)}`),
  getAllFixtures: () => get('/api/fixtures'),
  getTeams: () => get('/api/teams'),
  analyze: (team1, team2) => post('/api/analyze', { team1, team2 }),
  chat: (team1, team2, question, history) =>
    post('/api/chat', { team1, team2, question, history }),
  health: () => get('/api/health'),
}
