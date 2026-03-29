import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from datetime import datetime

from models import Config, Stats, MatchResponse, PitchResponse
from database import Database
from collector import RedditCollector
from hackernews_collector import HackerNewsCollector
from config import ConfigManager
from pitch_generator import generate_pitch

# Initialize FastAPI app
app = FastAPI(title="Reddit Monitor API", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
db = Database()
collector = RedditCollector()
hn_collector = HackerNewsCollector()
config_manager = ConfigManager()

# Background polling state
polling_task = None
is_polling = False
last_collection_time = None
next_collection_time = None


async def background_polling():
    """Background task to periodically collect posts"""
    global is_polling, last_collection_time, next_collection_time

    while is_polling:
        try:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Starting automatic collection...")

            # Update last collection time
            last_collection_time = datetime.now()

            collector.fetch_and_process_posts(limit=50)
            hn_collector.fetch_and_process_posts(limit_per_thread=80)

            # Get poll interval from config
            config = config_manager.get_config()
            poll_interval = config.poll_interval

            # Calculate next collection time
            next_collection_time = datetime.now().timestamp() + poll_interval

            print(f"Next collection in {poll_interval} seconds...")
            await asyncio.sleep(poll_interval)

        except Exception as e:
            print(f"Error in background polling: {e}")
            await asyncio.sleep(60)  # Wait 1 minute before retrying


@app.on_event("startup")
async def startup_event():
    """Start background polling on app startup"""
    global polling_task, is_polling

    print("Starting Reddit Monitor API...")
    print("Testing Reddit connection...")

    if collector.test_connection():
        print("Reddit API connection successful!")
    else:
        print("Warning: Reddit API connection failed. Check your .env credentials.")

    hn_collector.test_connection()

    # Start background polling
    is_polling = True
    polling_task = asyncio.create_task(background_polling())
    print("Background polling started.")


@app.on_event("shutdown")
async def shutdown_event():
    """Stop background polling on app shutdown"""
    global is_polling, polling_task

    print("Stopping background polling...")
    is_polling = False

    if polling_task:
        polling_task.cancel()
        try:
            await polling_task
        except asyncio.CancelledError:
            pass


# API Endpoints

@app.get("/")
def root():
    """API health check"""
    return {
        "status": "running",
        "message": "Reddit Monitor API",
        "polling": is_polling
    }


@app.get("/api/status")
def get_status():
    """Get collection status"""
    now = datetime.now()

    response = {
        "is_polling": is_polling,
        "last_collection": None,
        "last_collection_ago": None,
        "next_collection": None,
        "next_collection_in": None
    }

    if last_collection_time:
        response["last_collection"] = last_collection_time.isoformat()
        delta = (now - last_collection_time).total_seconds()
        response["last_collection_ago"] = int(delta)

    if next_collection_time:
        response["next_collection"] = next_collection_time
        delta = next_collection_time - now.timestamp()
        response["next_collection_in"] = max(0, int(delta))

    return response


@app.get("/api/matches", response_model=List[MatchResponse])
def get_matches(
    subreddit: Optional[str] = Query(None, description="Filter by subreddit/channel"),
    seen: Optional[bool] = Query(None, description="Filter by seen status"),
    limit: int = Query(50, ge=1, le=200, description="Number of matches to return"),
    source: Optional[str] = Query(None, description="Filter by source: reddit, hackernews"),
):
    """Get matches with optional filters"""
    try:
        matches = db.get_matches(subreddit=subreddit, seen=seen, limit=limit, source=source)
        return matches
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/matches/seen-all")
def mark_all_matches_seen(source: Optional[str] = Query(None, description="Filter by source: reddit, hackernews")):
    """Mark all unseen matches as seen, optionally filtered by source"""
    try:
        count = db.mark_all_seen(source=source)
        return {"success": True, "marked_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/matches/{match_id}/seen")
def mark_match_seen(match_id: int):
    """Mark a match as seen"""
    try:
        success = db.mark_as_seen(match_id)
        if not success:
            raise HTTPException(status_code=404, detail="Match not found")
        return {"success": True, "match_id": match_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats", response_model=Stats)
def get_stats(source: Optional[str] = Query(None, description="Filter by source: reddit, hackernews")):
    """Get dashboard statistics"""
    try:
        stats = db.get_stats(source=source)
        return Stats(**stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config", response_model=Config)
def get_config():
    """Get current configuration"""
    try:
        config = config_manager.get_config()
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config", response_model=Config)
def update_config(config: Config):
    """Update configuration"""
    try:
        updated_config = config_manager.save_config(config)
        return updated_config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/matches/{match_id}/pitch", response_model=PitchResponse)
def generate_match_pitch(match_id: int, force: bool = Query(False, description="Force regeneration ignoring cache")):
    """Generate (or return cached) a pitch draft for a match"""
    try:
        # Return existing draft if already generated (unless force=true)
        if not force:
            existing = db.get_pitch_draft(match_id)
            if existing:
                return PitchResponse(**existing)

        # Fetch match data
        match = db.get_match_by_id(match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        # Fetch knowledge base from config
        config = config_manager.get_config()

        # Generate pitch
        draft = generate_pitch(
            post_title=match.title or "",
            post_body=match.body or "",
            skills_needed=match.skills_needed or [],
            user_bio=config.user_bio,
            user_skills=config.user_skills,
            user_hourly_rate=config.user_hourly_rate,
            user_portfolio_url=config.user_portfolio_url,
        )

        if not draft:
            raise HTTPException(
                status_code=503,
                detail="AI service unavailable. Set OPENAI_API_KEY in backend/.env"
            )

        saved = db.save_pitch_draft(match_id, draft)
        return PitchResponse(**saved)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/matches/{match_id}/pitch", response_model=PitchResponse)
def get_match_pitch(match_id: int):
    """Get an existing pitch draft for a match"""
    try:
        existing = db.get_pitch_draft(match_id)
        if not existing:
            raise HTTPException(status_code=404, detail="No pitch draft found for this match")
        return PitchResponse(**existing)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/skills")
def get_skills_analytics(
    days: int = Query(30, ge=1, le=90, description="Lookback window in days"),
    source: Optional[str] = Query(None, description="Filter by source: reddit, hackernews"),
):
    """Get top skills mentioned in AI-analyzed matches, ranked by frequency"""
    try:
        skills = db.get_top_skills(days=days, source=source)
        return {"skills": skills, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/collect")
def trigger_collection():
    """Manually trigger a collection"""
    global last_collection_time
    try:
        print("\n[Manual] Triggering collection...")
        last_collection_time = datetime.now()
        reddit_stats = collector.fetch_and_process_posts(limit=100)
        hn_stats = hn_collector.fetch_and_process_posts(limit_per_thread=120)
        return {
            "success": True,
            "stats": {
                "reddit": reddit_stats,
                "hackernews": hn_stats,
                "total_new": reddit_stats.get("posts_new", 0) + hn_stats.get("posts_new", 0),
                "total_matches": reddit_stats.get("matches_found", 0) + hn_stats.get("matches_found", 0),
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Run with: uvicorn main:app --reload --port 8000
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
