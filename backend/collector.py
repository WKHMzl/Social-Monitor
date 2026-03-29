import praw
import json
from datetime import datetime
from typing import List, Dict, Any, Set
import os
from dotenv import load_dotenv

from models import Post, Match
from database import Database
from parser import normalize_text, combine_post_text
from rule_engine import evaluate_content, should_process_post
from config import ConfigManager
from ai_classifier import classify_intent
from notifier import send_windows_notification

# Load environment variables
load_dotenv()


class RedditCollector:
    """Collect and analyze posts from Reddit"""

    def __init__(self, db_path: str = "reddit_monitor.db"):
        # Initialize Reddit API
        self.reddit = praw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID"),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
            user_agent=os.getenv("REDDIT_USER_AGENT", "RedditMonitor/1.0")
        )

        self.db = Database(db_path)
        self.config_manager = ConfigManager(db_path)

    def fetch_and_process_posts(self, limit: int = 100) -> Dict[str, Any]:
        """
        Fetch new posts from configured subreddits and process them.

        Returns:
            Statistics about the collection run
        """
        config = self.config_manager.get_config()

        stats = {
            "posts_checked": 0,
            "posts_new": 0,
            "matches_found": 0,
            "subreddits": config.subreddits
        }

        subreddits_with_matches: Set[str] = set()

        for subreddit_name in config.subreddits:
            try:
                print(f"Fetching from r/{subreddit_name}...")
                subreddit = self.reddit.subreddit(subreddit_name)

                # Get new posts
                for submission in subreddit.new(limit=limit):
                    stats["posts_checked"] += 1

                    # Check if already processed
                    if self.db.post_exists(submission.id):
                        continue

                    # Create Post object
                    post = Post(
                        reddit_id=submission.id,
                        subreddit=subreddit_name,
                        title=submission.title,
                        body=submission.selftext,
                        author=str(submission.author) if submission.author else "[deleted]",
                        score=submission.score,
                        url=f"https://reddit.com{submission.permalink}",
                        created_utc=int(submission.created_utc)
                    )

                    # Check score threshold
                    if not should_process_post(post.score, config.min_score):
                        continue

                    # Combine and normalize text
                    combined_text = combine_post_text(post.title or "", post.body or "")
                    normalized_text = normalize_text(combined_text)

                    # Evaluate against keyword rules (pre-filter)
                    # Pass title separately for prefix detection ([HIRING] / [FOR HIRE])
                    evaluation = evaluate_content(normalized_text, config.model_dump(), title=post.title or "")

                    # If keyword pre-filter matched, run AI classification
                    if evaluation["matched"]:
                        post_id = self.db.insert_post(post)
                        if post_id:
                            stats["posts_new"] += 1

                            # AI intent classification
                            ai_result = classify_intent(post.title or "", post.body or "")

                            # Create match with AI fields
                            match = Match(
                                reddit_id=post.reddit_id,
                                post_id=post_id,
                                keyword_match=json.dumps(evaluation["keywords_found"]),
                                rule_score=evaluation["score"],
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
                            subreddits_with_matches.add(subreddit_name)

                            intent_info = ""
                            if ai_result.get("ai_processed"):
                                intent_info = f" | intent: {ai_result.get('intent_score', 0):.0%}"
                            prefix_info = " [PREFIX]" if evaluation.get("prefix_boost") else ""
                            print(f"  Match{prefix_info}: {post.title[:55]}... (kw: {evaluation['score']}{intent_info})")

            except Exception as e:
                print(f"Error fetching from r/{subreddit_name}: {e}")
                continue

        print(f"\nCollection complete:")
        print(f"  Posts checked: {stats['posts_checked']}")
        print(f"  New posts: {stats['posts_new']}")
        print(f"  Matches found: {stats['matches_found']}")

        # Send Windows system notification when new matches found
        if stats["matches_found"] > 0:
            send_windows_notification(stats["matches_found"], list(subreddits_with_matches))

        return stats

    def test_connection(self) -> bool:
        """Test Reddit API connection"""
        try:
            self.reddit.user.me()
            print("Connected to Reddit API (read-only mode)")
            return True
        except Exception as e:
            print(f"Reddit API connection failed: {e}")
            return False
