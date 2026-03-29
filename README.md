# SocialMonitor

A self-hosted opportunity monitor that watches Reddit and Hacker News for freelance and contract work — filtering noise with keyword rules and scoring leads with AI.

Built for my own workflow. Runs locally on Windows, sends toast notifications, and generates pitch drafts on demand.

![stack](https://img.shields.io/badge/Python-FastAPI-009688?style=flat-square&logo=fastapi) ![stack](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js) ![stack](https://img.shields.io/badge/OpenAI-gpt--4o--mini-412991?style=flat-square&logo=openai) ![stack](https://img.shields.io/badge/SQLite-local-003B57?style=flat-square&logo=sqlite)

---

## What it does

- **Monitors 58 subreddits** across freelance, SaaS, e-commerce, automation, marketing, real estate, and more
- **Scrapes HN monthly threads** — "Who is Hiring" and "Seeking Freelancer" — via the Algolia API
- **Keyword pre-filter** (126 positive, 54 negative) catches hiring intent before hitting the AI
- **AI classification** via `gpt-4o-mini`: intent score (0–1), skills needed, budget hint, urgency
- **Composite match score** — intent (50%) + budget signal (30%) + your skill overlap (20%)
- **Pitch generator** — one click, personalized reply draft based on your profile and the post
- **Windows toast notifications** when new matches arrive, clickable to open the dashboard
- **Skills analytics** — bar chart of top skills in demand over 7/14/30 days

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11, FastAPI, PRAW, SQLite |
| AI | OpenAI `gpt-4o-mini` (classifier + pitch) |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Data sources | Reddit API (PRAW), HN Algolia API |
| Notifications | PowerShell WinRT (Windows 11 toast) |

---

## Setup

**1. Clone and configure**

```bash
git clone https://github.com/WKHMzl/Social-Monitor
cd Social-Monitor
```

Create `backend/.env`:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=SocialMonitor/1.0
OPENAI_API_KEY=your_openai_key
```

Get Reddit credentials at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) (script app, read-only).
`OPENAI_API_KEY` is optional — without it, AI scoring and pitch generation are disabled.

**2. Install backend**

```bash
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

**3. Install frontend**

```bash
cd frontend
npm install
```

**4. Run**

```bash
# From the root — starts both services
start.bat
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3002`

---

## How it works

```
Reddit API / HN Algolia
        ↓
  Keyword pre-filter          ← 126 positive + 54 negative rules
        ↓
  gpt-4o-mini classifier      ← intent score, skills, budget, urgency
        ↓
  SQLite (local)
        ↓
  Next.js dashboard           ← composite score, pitch drafts, skill analytics
```

The backend polls every 5 minutes. Each post that passes keyword filtering goes through the AI classifier. Matches are stored locally in SQLite and surfaced in the dashboard with composite scoring based on your configured skill profile.

---

## Configuration

Go to `/config` in the dashboard to set:

- **Subreddits** to monitor
- **Keyword rules** (positive and negative)
- **Poll interval**
- **Freelancer profile** — bio, skills, rate, portfolio URL (used by the pitch generator)

---

## Project structure

```
SocialMonitor/
├── backend/
│   ├── main.py                 # FastAPI app + background polling
│   ├── collector.py            # Reddit collection via PRAW
│   ├── hackernews_collector.py # HN via Algolia API
│   ├── database.py             # SQLite operations
│   ├── ai_classifier.py        # gpt-4o-mini intent scoring
│   ├── pitch_generator.py      # gpt-4o-mini pitch drafts
│   ├── rule_engine.py          # keyword matching + prefix detection
│   ├── config.py               # ConfigManager + defaults
│   ├── notifier.py             # Windows 11 toast notifications
│   └── models.py               # Pydantic models
└── frontend/
    ├── app/
    │   ├── reddit/page.tsx     # Reddit dashboard
    │   ├── hackernews/page.tsx # HN dashboard
    │   └── config/page.tsx     # Settings + freelancer profile
    └── components/
        ├── MatchCard.tsx       # Card: score, AI analysis, pitch
        ├── Sidebar.tsx         # Navigation
        ├── FilterBar.tsx       # Filters: seen, age, sort, skill
        ├── StatsPanel.tsx      # Stats: total, 24h, unseen, AI analyzed
        └── SkillsPanel.tsx     # Top skills bar chart
```

---

## API

```
GET  /api/matches               # List matches (filters: source, seen, subreddit)
GET  /api/stats                 # Dashboard stats
GET  /api/config                # Current config
POST /api/config                # Update config
POST /api/collect               # Trigger manual collection
POST /api/matches/{id}/pitch    # Generate pitch draft
GET  /api/analytics/skills      # Top skills by frequency
```

---

Built by [WKHMzl](https://github.com/WKHMzl)
