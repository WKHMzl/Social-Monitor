from pydantic import BaseModel
from typing import Optional, List


class Post(BaseModel):
    """Reddit post model"""
    id: Optional[int] = None
    reddit_id: str
    subreddit: str
    title: Optional[str] = None
    body: Optional[str] = None
    author: str
    score: int
    url: str
    created_utc: int
    fetched_at: Optional[int] = None
    source: str = "reddit"  # "reddit" | "hackernews"


class Config(BaseModel):
    """Configuration model"""
    positive_keywords: List[str]
    negative_keywords: List[str]
    subreddits: List[str]
    poll_interval: int  # seconds
    min_score: int
    # Knowledge Base (freelancer profile)
    user_bio: Optional[str] = None
    user_skills: Optional[str] = None        # comma-separated string
    user_hourly_rate: Optional[str] = None   # e.g. "$50/hour"
    user_portfolio_url: Optional[str] = None


class MatchResponse(BaseModel):
    """API response for a match with post details"""
    id: int
    reddit_id: str
    subreddit: str
    title: Optional[str]
    body: Optional[str]
    author: str
    score: int
    url: str
    created_utc: int
    keyword_match: List[str]
    rule_score: float
    detected_at: int
    seen: bool
    # AI Classification fields
    intent_score: Optional[float] = None
    skills_needed: Optional[List[str]] = None
    budget_hint: Optional[str] = None
    urgency_hint: Optional[str] = None
    ai_analysis: Optional[str] = None
    ai_processed: bool = False
    source: str = "reddit"  # "reddit" | "hackernews"


class Match(BaseModel):
    """Internal match model for DB operations"""
    id: Optional[int] = None
    reddit_id: str
    post_id: Optional[int] = None
    keyword_match: str  # JSON string of matched keywords
    rule_score: float
    detected_at: int
    seen: bool = False
    # AI Classification fields
    intent_score: Optional[float] = None
    skills_needed: Optional[str] = None  # JSON string internally
    budget_hint: Optional[str] = None
    urgency_hint: Optional[str] = None
    ai_analysis: Optional[str] = None
    ai_processed: bool = False

    # Joined data from post
    post: Optional[Post] = None


class PitchResponse(BaseModel):
    """Pitch draft response"""
    match_id: int
    draft: str
    generated_at: int


class Stats(BaseModel):
    """Dashboard statistics"""
    total_matches: int
    today_matches: int
    unseen_matches: int
    top_subreddits: List[dict]  # [{"subreddit": "...", "count": ...}]
    ai_processed_count: int = 0
    avg_intent_score: Optional[float] = None
