import html
import json
import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set

import requests

from ai_classifier import classify_intent
from database import Database
from models import Match, Post

HN_ALGOLIA = "https://hn.algolia.com/api/v1"

# (search_query, subreddit_tag, filter_seeking_freelancer_only)
THREAD_SEARCHES = [
    ("Ask HN: Who is Hiring?", "hn_who_is_hiring", False),
    ("Ask HN: Freelancer? Seeking Freelancer?", "hn_seeking_freelancer", True),
]

_SESSION = requests.Session()
_SESSION.headers["User-Agent"] = "SocialMonitor/1.0"


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _algolia_get(path: str, params: dict) -> Optional[dict]:
    try:
        resp = _SESSION.get(f"{HN_ALGOLIA}/{path}", params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[HN] Algolia request failed: {e}")
        return None


class HackerNewsCollector:
    def __init__(self, db_path: str = "reddit_monitor.db"):
        self.db = Database(db_path)

    # ── Thread discovery ────────────────────────────────────────────────────

    def _find_threads(self, query: str, limit: int = 2) -> List[Dict]:
        """Find the latest monthly HN threads matching the query.

        Uses search_by_date (newest first) with a 90-day cutoff so old popular
        threads from previous years don't crowd out the current month's thread.
        """
        cutoff_ts = int((datetime.now() - timedelta(days=90)).timestamp())
        data = _algolia_get("search", {
            "query": query,
            "tags": "ask_hn",
            "hitsPerPage": limit,
            "numericFilters": f"created_at_i>{cutoff_ts}",
        })
        return data.get("hits", []) if data else []

    # ── Comment fetching ─────────────────────────────────────────────────────

    def _get_top_level_comments(
        self, story_id: str, cutoff_days: int = 35, max_comments: int = 120
    ) -> List[Dict]:
        """
        Fetch top-level comments (direct children of the story) via Algolia.
        Uses search_by_date so newest comments come first.
        """
        cutoff_ts = int((datetime.now() - timedelta(days=cutoff_days)).timestamp())
        comments: List[Dict] = []
        page = 0

        while len(comments) < max_comments:
            data = _algolia_get("search_by_date", {
                "tags": f"comment,story_{story_id}",
                "hitsPerPage": 100,
                "page": page,
                "numericFilters": f"created_at_i>{cutoff_ts}",
            })
            if not data or not data.get("hits"):
                break

            for hit in data["hits"]:
                # Keep only top-level comments (direct reply to the story)
                if str(hit.get("parent_id")) == str(story_id):
                    # Skip deleted / empty comments
                    if hit.get("comment_text"):
                        comments.append(hit)
                if len(comments) >= max_comments:
                    break

            if len(data["hits"]) < 100:
                break  # No more pages
            page += 1
            time.sleep(0.25)  # Polite rate-limiting

        return comments

    # ── Model conversion ─────────────────────────────────────────────────────

    def _comment_to_post(self, comment: Dict, source_tag: str) -> Optional[Post]:
        comment_id = str(comment.get("objectID") or "")
        if not comment_id:
            return None

        text = _strip_html(comment.get("comment_text") or "")
        if not text.strip():
            return None

        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        # First line is the headline: "Company | Location | Remote | Stack"
        title = lines[0][:200] if lines else f"HN comment {comment_id}"
        body = "\n".join(lines[1:])[:3000] if len(lines) > 1 else ""

        return Post(
            reddit_id=f"hn_{comment_id}",
            subreddit=source_tag,
            title=title,
            body=body,
            author=comment.get("author") or "[deleted]",
            score=comment.get("points") or 0,
            url=f"https://news.ycombinator.com/item?id={comment_id}",
            created_utc=int(comment.get("created_at_i") or time.time()),
            source="hackernews",
        )

    # ── Main entry point ─────────────────────────────────────────────────────

    def fetch_and_process_posts(self, limit_per_thread: int = 120) -> Dict[str, Any]:
        """
        Fetch HN hiring/freelancer monthly threads and process new comments.
        Returns collection statistics.
        """
        stats: Dict[str, Any] = {
            "posts_checked": 0,
            "posts_new": 0,
            "matches_found": 0,
            "source": "hackernews",
        }
        subreddits_with_matches: Set[str] = set()

        for query, source_tag, seeking_only in THREAD_SEARCHES:
            print(f"[HN] Searching threads: «{query}»")
            threads = self._find_threads(query, limit=2)

            for thread in threads:
                story_id = str(thread.get("objectID") or "")
                if not story_id:
                    continue
                print(f"  [HN] Thread: {thread.get('title', '')[:70]}  (id={story_id})")

                comments = self._get_top_level_comments(
                    story_id, cutoff_days=35, max_comments=limit_per_thread
                )

                for comment in comments:
                    stats["posts_checked"] += 1
                    comment_id = str(comment.get("objectID") or "")
                    reddit_id = f"hn_{comment_id}"

                    # Deduplication — already processed?
                    if self.db.post_exists(reddit_id):
                        continue

                    # For "Freelancer?" thread: keep only SEEKING FREELANCER posts.
                    # "SEEKING WORK" posts are freelancers advertising themselves — skip.
                    if seeking_only:
                        raw = _strip_html(comment.get("comment_text") or "").lower()
                        if not (
                            raw.startswith("seeking freelancer")
                            or raw.startswith("seeking contractor")
                        ):
                            continue

                    post = self._comment_to_post(comment, source_tag)
                    if not post:
                        continue

                    post_id = self.db.insert_post(post)
                    if not post_id:
                        continue  # Duplicate hash

                    stats["posts_new"] += 1

                    # AI intent classification (same pipeline as Reddit)
                    ai_result = classify_intent(post.title or "", post.body or "")

                    match = Match(
                        reddit_id=post.reddit_id,
                        post_id=post_id,
                        # HN hiring threads = inherent hiring intent; tag the source
                        keyword_match=json.dumps(["hackernews", source_tag]),
                        rule_score=50,  # Base score: HN threads are curated
                        detected_at=int(datetime.now().timestamp()),
                        seen=False,
                        intent_score=ai_result.get("intent_score"),
                        skills_needed=json.dumps(ai_result.get("skills_needed", [])),
                        budget_hint=ai_result.get("budget_hint"),
                        urgency_hint=ai_result.get("urgency_hint"),
                        ai_analysis=ai_result.get("analysis"),
                        ai_processed=ai_result.get("ai_processed", False),
                    )

                    self.db.insert_match(match)
                    stats["matches_found"] += 1
                    subreddits_with_matches.add(source_tag)

                    intent_info = ""
                    if ai_result.get("ai_processed"):
                        intent_info = f" | intent: {ai_result.get('intent_score', 0):.0%}"
                    print(f"    New: {post.title[:65]}…{intent_info}")

        print(
            f"[HN] Done — checked: {stats['posts_checked']}, "
            f"new: {stats['posts_new']}, matches: {stats['matches_found']}"
        )
        return stats

    def test_connection(self) -> bool:
        """Verify Algolia HN API is reachable."""
        data = _algolia_get("search", {"query": "Ask HN: Who is Hiring?", "tags": "ask_hn", "hitsPerPage": 1})
        ok = bool(data and data.get("hits"))
        print(f"[HN] API {'OK' if ok else 'FAILED'}")
        return ok
