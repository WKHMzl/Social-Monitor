import sqlite3
import json
import hashlib
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from models import Post, Match, MatchResponse


def _compute_content_hash(author: str, title: str) -> str:
    """Hash de autor+título normalizado para detectar cross-posts do mesmo usuário."""
    normalized = f"{author}:{title.strip().lower()[:120]}"
    return hashlib.md5(normalized.encode()).hexdigest()


class Database:
    """SQLite database operations"""

    def __init__(self, db_path: str = "reddit_monitor.db"):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """Initialize database tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Posts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reddit_id TEXT UNIQUE NOT NULL,
                subreddit TEXT NOT NULL,
                title TEXT,
                body TEXT,
                author TEXT,
                score INTEGER,
                url TEXT,
                created_utc INTEGER,
                fetched_at INTEGER
            )
        """)

        # Matches table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reddit_id TEXT NOT NULL,
                post_id INTEGER,
                keyword_match TEXT,
                rule_score REAL,
                detected_at INTEGER,
                seen BOOLEAN DEFAULT 0,
                FOREIGN KEY (post_id) REFERENCES posts(id)
            )
        """)

        # Config table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # Pitch drafts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pitch_drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER UNIQUE NOT NULL,
                draft TEXT NOT NULL,
                generated_at INTEGER NOT NULL,
                FOREIGN KEY (match_id) REFERENCES matches(id)
            )
        """)

        # Create indices for performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_reddit_id ON posts(reddit_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_subreddit ON posts(subreddit)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_seen ON matches(seen)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pitch_match_id ON pitch_drafts(match_id)")

        # Safe migrations for AI classification columns (no-op if already exist)
        ai_columns = [
            ("intent_score", "REAL"),
            ("skills_needed", "TEXT"),
            ("budget_hint", "TEXT"),
            ("urgency_hint", "TEXT"),
            ("ai_analysis", "TEXT"),
            ("ai_processed", "BOOLEAN DEFAULT 0"),
        ]
        for col_name, col_type in ai_columns:
            try:
                cursor.execute(f"ALTER TABLE matches ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass  # Column already exists

        # Migration: content_hash para deduplicação de cross-posts
        try:
            cursor.execute("ALTER TABLE posts ADD COLUMN content_hash TEXT")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_content_hash ON posts(content_hash)")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Migration: source para multi-plataforma (reddit | hackernews | rss_*)
        try:
            cursor.execute("ALTER TABLE posts ADD COLUMN source TEXT DEFAULT 'reddit'")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_source ON posts(source)")
        except sqlite3.OperationalError:
            pass  # Column already exists

        conn.commit()
        conn.close()

    def post_exists(self, reddit_id: str) -> bool:
        """Check if post already exists"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM posts WHERE reddit_id = ?", (reddit_id,))
        exists = cursor.fetchone() is not None
        conn.close()
        return exists

    def post_exists_by_hash(self, content_hash: str, hours: int = 24) -> bool:
        """Detecta cross-posts: mesmo autor+título em subreddit diferente nas últimas N horas."""
        cutoff = int((datetime.now() - timedelta(hours=hours)).timestamp())
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM posts WHERE content_hash = ? AND fetched_at > ?",
            (content_hash, cutoff)
        )
        exists = cursor.fetchone() is not None
        conn.close()
        return exists

    def insert_post(self, post: Post) -> Optional[int]:
        """Insert a new post, return post_id. Returns None if duplicate (reddit_id ou cross-post)."""
        if self.post_exists(post.reddit_id):
            return None

        content_hash = _compute_content_hash(post.author, post.title or "")
        if self.post_exists_by_hash(content_hash):
            return None  # Cross-post duplicado

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        post.fetched_at = int(datetime.now().timestamp())

        cursor.execute("""
            INSERT INTO posts (reddit_id, subreddit, title, body, author, score, url, created_utc, fetched_at, content_hash, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            post.reddit_id,
            post.subreddit,
            post.title,
            post.body,
            post.author,
            post.score,
            post.url,
            post.created_utc,
            post.fetched_at,
            content_hash,
            post.source,
        ))

        post_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return post_id

    def mark_all_seen(self, source: Optional[str] = None) -> int:
        """Marca todos os matches não vistos como vistos. Filtra por source se fornecido."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        if source:
            cursor.execute(
                """
                UPDATE matches SET seen = 1
                WHERE seen = 0
                  AND post_id IN (
                      SELECT id FROM posts WHERE COALESCE(source, 'reddit') = ?
                  )
                """,
                (source,),
            )
        else:
            cursor.execute("UPDATE matches SET seen = 1 WHERE seen = 0")
        count = cursor.rowcount
        conn.commit()
        conn.close()
        return count

    def insert_match(self, match: Match) -> int:
        """Insert a match, return match_id"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO matches (
                reddit_id, post_id, keyword_match, rule_score, detected_at, seen,
                intent_score, skills_needed, budget_hint, urgency_hint, ai_analysis, ai_processed
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            match.reddit_id,
            match.post_id,
            match.keyword_match,
            match.rule_score,
            match.detected_at,
            match.seen,
            match.intent_score,
            match.skills_needed,  # Already a JSON string
            match.budget_hint,
            match.urgency_hint,
            match.ai_analysis,
            match.ai_processed,
        ))

        match_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return match_id

    def _row_to_match_response(self, row: sqlite3.Row) -> MatchResponse:
        """Convert a DB row to a MatchResponse object."""
        skills_list: List[str] = []
        if row["skills_needed"]:
            try:
                skills_list = json.loads(row["skills_needed"])
            except (json.JSONDecodeError, TypeError):
                skills_list = []

        return MatchResponse(
            id=row["id"],
            reddit_id=row["reddit_id"],
            subreddit=row["subreddit"],
            title=row["title"],
            body=row["body"],
            author=row["author"],
            score=row["score"],
            url=row["url"],
            created_utc=row["created_utc"],
            keyword_match=json.loads(row["keyword_match"]),
            rule_score=row["rule_score"],
            detected_at=row["detected_at"],
            seen=bool(row["seen"]),
            intent_score=row["intent_score"],
            skills_needed=skills_list,
            budget_hint=row["budget_hint"],
            urgency_hint=row["urgency_hint"],
            ai_analysis=row["ai_analysis"],
            ai_processed=bool(row["ai_processed"]),
            source=row["source"] if "source" in row.keys() else "reddit",
        )

    def get_matches(
        self,
        subreddit: Optional[str] = None,
        seen: Optional[bool] = None,
        limit: int = 50,
        source: Optional[str] = None,
    ) -> List[MatchResponse]:
        """Get matches with filters"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = """
            SELECT
                m.id, m.reddit_id, m.keyword_match, m.rule_score, m.detected_at, m.seen,
                m.intent_score, m.skills_needed, m.budget_hint, m.urgency_hint, m.ai_analysis, m.ai_processed,
                p.subreddit, p.title, p.body, p.author, p.score, p.url, p.created_utc,
                COALESCE(p.source, 'reddit') as source
            FROM matches m
            JOIN posts p ON m.post_id = p.id
            WHERE 1=1
        """

        params = []

        if subreddit:
            query += " AND p.subreddit = ?"
            params.append(subreddit)

        if seen is not None:
            query += " AND m.seen = ?"
            params.append(int(seen))

        if source:
            query += " AND COALESCE(p.source, 'reddit') = ?"
            params.append(source)

        query += " ORDER BY p.created_utc DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        return [self._row_to_match_response(row) for row in rows]

    def get_match_by_id(self, match_id: int) -> Optional[MatchResponse]:
        """Get a single match by ID"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                m.id, m.reddit_id, m.keyword_match, m.rule_score, m.detected_at, m.seen,
                m.intent_score, m.skills_needed, m.budget_hint, m.urgency_hint, m.ai_analysis, m.ai_processed,
                p.subreddit, p.title, p.body, p.author, p.score, p.url, p.created_utc,
                COALESCE(p.source, 'reddit') as source
            FROM matches m
            JOIN posts p ON m.post_id = p.id
            WHERE m.id = ?
        """, (match_id,))

        row = cursor.fetchone()
        conn.close()

        return self._row_to_match_response(row) if row else None

    def mark_as_seen(self, match_id: int) -> bool:
        """Mark a match as seen"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("UPDATE matches SET seen = 1 WHERE id = ?", (match_id,))
        affected = cursor.rowcount

        conn.commit()
        conn.close()

        return affected > 0

    def get_stats(self, source: Optional[str] = None) -> Dict[str, Any]:
        """Get dashboard statistics, optionally filtered by source ('reddit' | 'hackernews')."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Source filter clause (always JOIN posts so we can filter by source)
        src_clause = "AND COALESCE(p.source, 'reddit') = ?" if source else ""
        src_params: list = [source] if source else []

        join_base = "FROM matches m JOIN posts p ON m.post_id = p.id WHERE 1=1"

        # Total matches
        cursor.execute(f"SELECT COUNT(*) {join_base} {src_clause}", src_params)
        total_matches = cursor.fetchone()[0]

        # Today's matches (last 24 hours)
        yesterday = int((datetime.now() - timedelta(days=1)).timestamp())
        cursor.execute(
            f"SELECT COUNT(*) {join_base} AND m.detected_at > ? {src_clause}",
            [yesterday] + src_params,
        )
        today_matches = cursor.fetchone()[0]

        # Unseen matches
        cursor.execute(f"SELECT COUNT(*) {join_base} AND m.seen = 0 {src_clause}", src_params)
        unseen_matches = cursor.fetchone()[0]

        # Top subreddits / channels
        cursor.execute(
            f"""
            SELECT p.subreddit, COUNT(*) as count
            {join_base} {src_clause}
            GROUP BY p.subreddit
            ORDER BY count DESC
            LIMIT 5
            """,
            src_params,
        )
        top_subreddits = [{"subreddit": row[0], "count": row[1]} for row in cursor.fetchall()]

        # AI processed count
        cursor.execute(
            f"SELECT COUNT(*) {join_base} AND m.ai_processed = 1 {src_clause}", src_params
        )
        ai_processed_count = cursor.fetchone()[0]

        # Average intent score for AI-processed matches
        cursor.execute(
            f"SELECT AVG(m.intent_score) {join_base} AND m.ai_processed = 1 AND m.intent_score IS NOT NULL {src_clause}",
            src_params,
        )
        avg_result = cursor.fetchone()[0]
        avg_intent_score = round(avg_result, 3) if avg_result is not None else None

        conn.close()

        return {
            "total_matches": total_matches,
            "today_matches": today_matches,
            "unseen_matches": unseen_matches,
            "top_subreddits": top_subreddits,
            "ai_processed_count": ai_processed_count,
            "avg_intent_score": avg_intent_score,
        }

    def get_post_by_reddit_id(self, reddit_id: str) -> Optional[int]:
        """Get post_id by reddit_id"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM posts WHERE reddit_id = ?", (reddit_id,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else None

    def get_pitch_draft(self, match_id: int) -> Optional[Dict[str, Any]]:
        """Get a pitch draft by match_id"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT match_id, draft, generated_at FROM pitch_drafts WHERE match_id = ?",
            (match_id,)
        )
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_top_skills(self, days: int = 30, source: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Count skill occurrences from AI-processed matches within the last N days.
        Optionally filtered by source ('reddit' | 'hackernews').
        Returns list of {skill, count} sorted by count descending.
        """
        cutoff = int((datetime.now() - timedelta(days=days)).timestamp())
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if source:
            cursor.execute(
                """
                SELECT m.skills_needed FROM matches m
                JOIN posts p ON m.post_id = p.id
                WHERE m.ai_processed = 1 AND m.skills_needed IS NOT NULL
                  AND m.detected_at > ? AND COALESCE(p.source, 'reddit') = ?
                """,
                (cutoff, source),
            )
        else:
            cursor.execute(
                "SELECT skills_needed FROM matches WHERE ai_processed = 1 AND skills_needed IS NOT NULL AND detected_at > ?",
                (cutoff,),
            )
        rows = cursor.fetchall()
        conn.close()

        skill_counts: Dict[str, int] = {}
        for (skills_json,) in rows:
            try:
                skills = json.loads(skills_json)
                for skill in skills:
                    skill_lower = skill.strip().lower()
                    if skill_lower:
                        skill_counts[skill_lower] = skill_counts.get(skill_lower, 0) + 1
            except (json.JSONDecodeError, TypeError):
                continue

        sorted_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)
        return [{"skill": skill, "count": count} for skill, count in sorted_skills[:30]]

    def save_pitch_draft(self, match_id: int, draft: str) -> Dict[str, Any]:
        """Save or update a pitch draft"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        now = int(datetime.now().timestamp())
        cursor.execute("""
            INSERT INTO pitch_drafts (match_id, draft, generated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET draft = excluded.draft, generated_at = excluded.generated_at
        """, (match_id, draft, now))
        conn.commit()
        conn.close()
        return {"match_id": match_id, "draft": draft, "generated_at": now}
