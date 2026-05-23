"""
WC 2026 Intelligence Dashboard - Backend
FastAPI + RocketRide pipeline orchestration + GMI Cloud (Gemini)

Install:
    pip install fastapi uvicorn requests rocketride

Run:
    uvicorn backend:app --reload --port 8000
"""

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rocketride import RocketRideClient
from rocketride.schema import Question, QuestionHistory

# ── API Keys ─────────────────────────────────────────────────────────────────
GMI_KEY           = os.getenv("GMI_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjM4MGY3YmFlLWU5ZTQtNDMxMy1iZGZjLTBiMzgwNTVjNjUwYyIsInNjb3BlIjoiaWVfbW9kZWwiLCJjbGllbnRJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCJ9.5Xg6mAGyXnKRGo85rZOpI1kHdTAtNhbR3uy-_v5Urrk")
FOOTBALL_DATA_KEY = os.getenv("FOOTBALL_DATA_KEY", "68697dfb6f4f4efbbaba2a1516e05646")
API_FOOTBALL_KEY  = os.getenv("API_FOOTBALL_KEY", "4d1021344afd5e68fa0f90e55e389d76")

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

FD_HEADERS  = {"X-Auth-Token": FOOTBALL_DATA_KEY}
AF_HEADERS  = {"x-apisports-key": API_FOOTBALL_KEY}
GMI_HEADERS = {"Authorization": f"Bearer {GMI_KEY}", "Content-Type": "application/json"}

FD_BASE  = "https://api.football-data.org/v4"
AF_BASE  = "https://v3.football.api-sports.io"
GMI_BASE = "https://api.gmi-serving.com/v1"

# ── RocketRide Global State ───────────────────────────────────────────────────
rr_client: RocketRideClient = None
analysis_token: str = None
chat_token: str = None

# ── Lifespan: start/stop RocketRide ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global rr_client, analysis_token, chat_token
    try:
        rr_client = RocketRideClient()
        await rr_client.connect()
        r1 = await rr_client.use(filepath="wc_analysis.pipe", use_existing=True)
        analysis_token = r1["token"]
        r2 = await rr_client.use(filepath="wc_chat.pipe", use_existing=True)
        chat_token = r2["token"]
        print(f"RocketRide ready — analysis:{analysis_token[:8]}… chat:{chat_token[:8]}…")
    except Exception as e:
        print(f"RocketRide startup error (falling back to direct GMI): {e}")
    yield
    if rr_client:
        try:
            await rr_client.disconnect()
        except Exception:
            pass

app = FastAPI(title="WC 2026 Intelligence API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Cache Helpers ─────────────────────────────────────────────────────────────
def load_cache(filename: str):
    path = DATA_DIR / filename
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None

def save_cache(filename: str, data):
    with open(DATA_DIR / filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

# ── Football-data.org helpers ─────────────────────────────────────────────────
def fetch_fd(endpoint: str, params: dict = {}):
    try:
        r = requests.get(f"{FD_BASE}/{endpoint}", headers=FD_HEADERS, params=params, timeout=10)
        if r.status_code == 200:
            return r.json()
        print(f"FD {r.status_code}: {r.text[:100]}")
    except Exception as e:
        print(f"FD error: {e}")
    return None

# ── GMI Cloud direct fallback ─────────────────────────────────────────────────
def gmi_call(prompt: str, system: str = "", history: list = None, max_tokens: int = 800) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    if history:
        messages.extend(history[-6:])
    messages.append({"role": "user", "content": prompt})
    try:
        r = requests.post(
            f"{GMI_BASE}/chat/completions",
            headers=GMI_HEADERS,
            json={"model": "google/gemini-3.1-flash-lite-preview", "messages": messages, "max_tokens": max_tokens},
            timeout=30,
        )
        if r.status_code == 200:
            msg = r.json()["choices"][0]["message"]
            return msg.get("content") or (msg.get("parts") or [{}])[0].get("text", "")
        print(f"GMI {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"GMI error: {e}")
    return ""

def gmi_json(prompt: str) -> dict:
    raw = gmi_call(prompt + "\n\nRespond ONLY with valid JSON, no markdown fences.")
    try:
        s, e = raw.find("{"), raw.rfind("}") + 1
        if s != -1 and e > s:
            return json.loads(raw[s:e])
    except Exception:
        pass
    return {}

# ── RocketRide LLM helper ─────────────────────────────────────────────────────
async def rr_ask(prompt: str, context: str = "", history: list = None, expect_json: bool = False) -> str:
    """Ask a question via RocketRide pipeline; fall back to direct GMI if unavailable."""
    if rr_client and analysis_token:
        try:
            q = Question(expectJson=expect_json)
            if context:
                q.addContext(context)
            if history:
                for h in history[-6:]:
                    q.addHistory(QuestionHistory(role=h["role"], content=h["content"]))
            q.addQuestion(prompt)
            resp = await rr_client.chat(token=analysis_token, question=q)
            answers = resp.get("answers", [])
            if answers:
                ans = answers[0]
                return json.dumps(ans) if isinstance(ans, dict) else str(ans)
        except Exception as e:
            print(f"RocketRide ask error: {e}")
    # Fallback
    return gmi_call(prompt, system=context)

async def rr_chat(team1: str, team2: str, question: str, history: list) -> str:
    """Chat endpoint via RocketRide pipeline; fall back to direct GMI."""
    system = (
        f"You are an expert football analyst for the 2026 FIFA World Cup. "
        f"The user is analyzing: {team1} vs {team2}. "
        "Answer concisely in max 3 sentences. Be objective and analytical."
    )
    if rr_client and chat_token:
        try:
            q = Question()
            q.addInstruction("Role", system)
            for h in history[-6:]:
                q.addHistory(QuestionHistory(role=h["role"], content=h["content"]))
            q.addQuestion(question)
            resp = await rr_client.chat(token=chat_token, question=q)
            answers = resp.get("answers", [])
            if answers:
                return str(answers[0])
        except Exception as e:
            print(f"RocketRide chat error: {e}")
    return gmi_call(question, system=system, history=history)

# ── Data helpers ──────────────────────────────────────────────────────────────
def get_fixtures_raw():
    data = fetch_fd("competitions/WC/matches", {"season": "2026"})
    if data and data.get("matches"):
        save_cache("wc2026_matches_live.json", data)
        return data
    return load_cache("wc2026_matches_live.json")

def get_teams_raw():
    data = fetch_fd("competitions/WC/teams", {"season": "2026"})
    if data and data.get("teams"):
        save_cache("wc2026_teams_live.json", data)
        return data
    return load_cache("wc2026_teams_live.json")

def get_h2h_data(team1: str, team2: str):
    t1 = team1.lower().replace(" ", "_")
    t2 = team2.lower().replace(" ", "_")
    for fname in [f"h2h_{t1}_{t2}.json", f"h2h_{t2}_{t1}.json"]:
        data = load_cache(fname)
        if data and data.get("response"):
            return data["response"]
    return []

def get_wc_history(team1: str, team2: str):
    results = {"team1": [], "team2": []}
    for season, fname in [("2022", "wc2022_matches.json"), ("2018", "wc2018_matches.json")]:
        data = load_cache(fname)
        if not data:
            continue
        for match in data.get("response", []):
            home = match["teams"]["home"]["name"]
            away = match["teams"]["away"]["name"]
            hg   = match["goals"]["home"] or 0
            ag   = match["goals"]["away"] or 0
            for idx, team in enumerate([team1, team2]):
                key = "team1" if idx == 0 else "team2"
                if team.lower() in home.lower() or team.lower() in away.lower():
                    is_home = team.lower() in home.lower()
                    tf = hg if is_home else ag
                    ta = ag if is_home else hg
                    result = "W" if tf > ta else "L" if tf < ta else "D"
                    results[key].append({
                        "season": season,
                        "opponent": away if is_home else home,
                        "score": f"{tf}-{ta}",
                        "result": result,
                        "stage": match["league"].get("round", ""),
                    })
    return results

def get_player_data(team_name: str):
    data = load_cache("wc2026_teams_live.json")
    if not data:
        return []
    for t in data.get("teams", []):
        if team_name.lower() in t["name"].lower():
            players = []
            for p in (t.get("squad") or [])[:11]:
                players.append({
                    "name": p.get("name", ""),
                    "position": p.get("position", ""),
                    "nationality": p.get("nationality", ""),
                    "dateOfBirth": p.get("dateOfBirth", ""),
                })
            return players
    return []

# ── Analysis pipeline (7 steps) ───────────────────────────────────────────────
async def run_analysis(team1: str, team2: str) -> dict:
    steps = []

    def step(n, name):
        steps.append({"step": n, "name": name, "status": "running"})

    def done(result=""):
        steps[-1]["status"] = "done"
        steps[-1]["result"] = result

    # Step 1 — H2H
    step(1, "Fetching head-to-head history")
    h2h = get_h2h_data(team1, team2)
    done(f"{len(h2h)} matches found")

    # Step 2 — WC history
    step(2, "Analyzing World Cup history 2018 + 2022")
    wc_history = get_wc_history(team1, team2)
    t1_rec = wc_history["team1"]
    t2_rec = wc_history["team2"]
    done(f"{team1}: {len(t1_rec)} matches, {team2}: {len(t2_rec)} matches")

    # Step 3 — Players
    step(3, "Loading player data")
    t1_players = get_player_data(team1)
    t2_players = get_player_data(team2)
    done("Player data loaded")

    # Build context for LLM
    t1_form  = [m["result"] for m in t1_rec[-5:]] if t1_rec else []
    t2_form  = [m["result"] for m in t2_rec[-5:]] if t2_rec else []
    t1_goals = sum(int(m["score"].split("-")[0]) for m in t1_rec) if t1_rec else 0
    t2_goals = sum(int(m["score"].split("-")[0]) for m in t2_rec) if t2_rec else 0
    t1_top   = t1_players[0]["name"] if t1_players else "Unknown"
    t2_top   = t2_players[0]["name"] if t2_players else "Unknown"
    h2h_summary = f"Last {len(h2h)} H2H meetings available" if h2h else "No recent H2H data"

    match_ctx = (
        f"MATCH: {team1} vs {team2} — 2026 FIFA World Cup\n"
        f"H2H: {h2h_summary}\n"
        f"{team1} WC form (last 5): {t1_form or 'No data'}\n"
        f"{team2} WC form (last 5): {t2_form or 'No data'}\n"
        f"{team1} WC goals total: {t1_goals}\n"
        f"{team2} WC goals total: {t2_goals}\n"
        f"{team1} key player: {t1_top}\n"
        f"{team2} key player: {t2_top}\n"
    )

    # Step 4 — Win probability (RocketRide → GMI Cloud)
    step(4, "Running prediction model via GMI Cloud (RocketRide)")
    pred_prompt = (
        f"You are an expert FIFA World Cup 2026 analyst.\n{match_ctx}\n"
        "Return ONLY valid JSON:\n"
        '{"probabilities":{"team1_win":<int>,"draw":<int>,"team2_win":<int>},'
        '"predicted_score":"<e.g. 2-1>",'
        '"key_factors":["<f1>","<f2>","<f3>"],'
        '"team1_strengths":["<s1>","<s2>"],'
        '"team2_strengths":["<s1>","<s2>"],'
        '"key_battle":"<one player matchup>"}'
        "\nProbabilities must sum to 100."
    )
    pred_raw = await rr_ask(pred_prompt, expect_json=True)
    prediction = {}
    if pred_raw:
        try:
            s, e = pred_raw.find("{"), pred_raw.rfind("}") + 1
            if s != -1 and e > s:
                prediction = json.loads(pred_raw[s:e])
        except Exception:
            pass
    if not prediction:
        prediction = gmi_json(pred_prompt)
    if not prediction:
        prediction = {
            "probabilities": {"team1_win": 40, "draw": 25, "team2_win": 35},
            "predicted_score": "1-1",
            "key_factors": ["Historical record", "Current form", "Squad depth"],
            "team1_strengths": ["Attacking quality", "Experience"],
            "team2_strengths": ["Defensive solidity", "Team cohesion"],
            "key_battle": f"{t1_top} vs {t2_top}",
        }
    p = prediction.get("probabilities", {})
    done(f"{team1} {p.get('team1_win')}% | Draw {p.get('draw')}% | {team2} {p.get('team2_win')}%")

    # Step 5 — Tactical narrative
    step(5, "Generating tactical analysis via GMI Cloud")
    tac_prompt = (
        f"Write a 3-sentence tactical match preview for {team1} vs {team2} at the 2026 World Cup. "
        "Be specific about playing styles and what will decide the match. Sound like an ESPN analyst."
    )
    tactical = await rr_ask(tac_prompt, context=match_ctx)
    if not tactical:
        tactical = (
            f"This promises to be a fascinating clash between {team1} and {team2}. "
            "Both teams bring contrasting styles that should make for an entertaining contest. "
            "The key battle will be in midfield where the match could be won or lost."
        )
    done()

    # Step 6 — Formation recommendations
    step(6, "Generating formation recommendations via GMI Cloud")
    form_prompt = (
        f"Recommend best formations for {team1} vs {team2} at 2026 World Cup.\n"
        "Return ONLY valid JSON:\n"
        '{"team1_formation":"<e.g. 4-3-3>","team2_formation":"<e.g. 4-2-3-1>",'
        '"team1_style":"<2 word style>","team2_style":"<2 word style>",'
        '"team1_lineup":["GK","RB","CB","CB","LB","CDM","CM","CM","RW","ST","LW"],'
        '"team2_lineup":["GK","RB","CB","CB","LB","CDM","CAM","CM","RW","ST","LW"]}'
    )
    form_raw = await rr_ask(form_prompt, context=match_ctx, expect_json=True)
    formations = {}
    if form_raw:
        try:
            s, e = form_raw.find("{"), form_raw.rfind("}") + 1
            if s != -1 and e > s:
                formations = json.loads(form_raw[s:e])
        except Exception:
            pass
    if not formations:
        formations = gmi_json(form_prompt)
    if not formations:
        formations = {
            "team1_formation": "4-3-3", "team2_formation": "4-2-3-1",
            "team1_style": "High Press", "team2_style": "Counter Attack",
            "team1_lineup": ["GK","RB","CB","CB","LB","CDM","CM","CM","RW","ST","LW"],
            "team2_lineup": ["GK","RB","CB","CB","LB","CDM","CAM","CM","RW","ST","LW"],
        }
    done()

    # Step 7 — Compile
    steps.append({"step": 7, "name": "Compiling intelligence dashboard", "status": "done", "result": "Ready"})

    return {
        "team1": team1, "team2": team2,
        "h2h": h2h[:5],
        "wc_history": wc_history,
        "prediction": prediction,
        "tactical_analysis": tactical,
        "formations": formations,
        "players": {"team1": t1_players[:11], "team2": t2_players[:11]},
        "agent_steps": steps,
    }

# ── API Endpoints ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "WC 2026 Intelligence API", "version": "2.0", "pipeline": "RocketRide + GMI Cloud"}

@app.get("/api/groups")
def get_groups():
    """Build groups from fixtures data (standings groups are null pre-tournament)."""
    matches = get_fixtures_raw()
    if not matches:
        raise HTTPException(status_code=500, detail="Could not fetch fixtures")

    # Build a crest/tla lookup from teams endpoint
    teams_data = get_teams_raw()
    team_meta: dict = {}
    if teams_data:
        for t in teams_data.get("teams", []):
            team_meta[t["name"]] = {"crest": t.get("crest", ""), "tla": t.get("tla", "")}

    groups: dict = {}
    seen: dict = {}  # group -> set of team names

    for m in matches.get("matches", []):
        grp = m.get("group") or ""
        if "GROUP" not in grp:
            continue
        key = grp.replace("GROUP_", "")  # "GROUP_A" → "A"
        if key not in groups:
            groups[key] = []
            seen[key] = set()

        for side in ["homeTeam", "awayTeam"]:
            t = m[side]
            name = t.get("name") or ""
            if not name or name in seen[key]:
                continue
            seen[key].add(name)
            meta = team_meta.get(name, {})
            groups[key].append({
                "id": t.get("id"),
                "name": name,
                "shortName": t.get("shortName", name),
                "tla": t.get("tla") or meta.get("tla", ""),
                "crest": t.get("crest") or meta.get("crest", ""),
            })

    return dict(sorted(groups.items()))

@app.get("/api/fixtures")
def get_fixtures():
    data = get_fixtures_raw()
    if not data:
        raise HTTPException(status_code=500, detail="Could not fetch fixtures")
    out = []
    for m in data.get("matches", []):
        out.append({
            "id": m["id"],
            "date": m["utcDate"][:10],
            "time": m["utcDate"][11:16],
            "stage": m.get("stage", ""),
            "group": (m.get("group") or "").replace("GROUP_", ""),
            "home": m["homeTeam"]["name"],
            "away": m["awayTeam"]["name"],
            "home_tla": m["homeTeam"].get("tla", ""),
            "away_tla": m["awayTeam"].get("tla", ""),
            "home_crest": m["homeTeam"].get("crest", ""),
            "away_crest": m["awayTeam"].get("crest", ""),
            "status": m["status"],
            "score_home": (m.get("score") or {}).get("fullTime", {}).get("home"),
            "score_away": (m.get("score") or {}).get("fullTime", {}).get("away"),
        })
    return out

@app.get("/api/fixtures/{team_name}")
def get_team_fixtures(team_name: str):
    data = get_fixtures_raw()
    if not data:
        raise HTTPException(status_code=500, detail="Could not fetch fixtures")
    out = []
    tl = team_name.lower()
    for m in data.get("matches", []):
        home = m["homeTeam"]["name"] or ""
        away = m["awayTeam"]["name"] or ""
        if tl in home.lower() or tl in away.lower():
            out.append({
                "id": m["id"],
                "date": m["utcDate"][:10],
                "time": m["utcDate"][11:16],
                "stage": m.get("stage", ""),
                "group": (m.get("group") or "").replace("GROUP_", ""),
                "home": home,
                "away": away,
                "home_tla": m["homeTeam"].get("tla", ""),
                "away_tla": m["awayTeam"].get("tla", ""),
                "home_crest": m["homeTeam"].get("crest", ""),
                "away_crest": m["awayTeam"].get("crest", ""),
                "status": m["status"],
                "score_home": (m.get("score") or {}).get("fullTime", {}).get("home"),
                "score_away": (m.get("score") or {}).get("fullTime", {}).get("away"),
            })
    return out

@app.get("/api/teams")
def get_teams():
    data = get_teams_raw()
    if not data:
        raise HTTPException(status_code=500, detail="Could not fetch teams")
    out = []
    for t in data.get("teams", []):
        coach = t.get("coach") or {}
        out.append({
            "id": t["id"],
            "name": t["name"],
            "shortName": t.get("shortName", t["name"]),
            "tla": t.get("tla", ""),
            "crest": t.get("crest", ""),
            "coach": coach.get("name") or "Unknown",
            "squad": t.get("squad", []),
        })
    return out

class AnalyzeRequest(BaseModel):
    team1: str
    team2: str

@app.post("/api/analyze")
async def analyze_match(req: AnalyzeRequest):
    return await run_analysis(req.team1, req.team2)

class ChatRequest(BaseModel):
    team1: str
    team2: str
    question: str
    history: list = []

@app.post("/api/chat")
async def chat(req: ChatRequest):
    answer = await rr_chat(req.team1, req.team2, req.question, req.history)
    return {"answer": answer}

@app.get("/api/health")
def health():
    status: dict = {"rocketride": "connected" if rr_client else "unavailable"}
    try:
        r = requests.get(f"{FD_BASE}/competitions/WC", headers=FD_HEADERS, timeout=5)
        status["football_data"] = "ok" if r.status_code == 200 else f"error {r.status_code}"
    except Exception:
        status["football_data"] = "unreachable"
    try:
        test = gmi_call("Say OK", max_tokens=5)
        status["gmi_cloud"] = "ok" if test else "no response"
    except Exception:
        status["gmi_cloud"] = "unreachable"
    return status
