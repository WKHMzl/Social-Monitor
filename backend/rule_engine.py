import re
from typing import Dict, List, Any, Optional, Tuple


# Title prefixes that strongly indicate hiring intent (subreddits like r/forhire use these)
HIRING_PREFIXES = [
    "[hiring]",
    "[h]",
    "[paid]",
    "[contract]",
    "[job]",
    "[opportunity]",
    "[gig]",
    "[project]",
]

# Title prefixes that strongly indicate self-promotion (someone offering services, not hiring)
FOR_HIRE_PREFIXES = [
    "[for hire]",
    "[forhire]",
    "[available]",
    "[open to work]",
    "[seeking]",
    "[looking for work]",
]


def detect_title_prefix(title: str) -> Tuple[Optional[str], str]:
    """
    Detect structured prefix like [HIRING] or [FOR HIRE] at the start of a title.

    Returns:
        (prefix_type, detected_prefix)
        prefix_type: "hiring" | "for_hire" | None
        detected_prefix: the actual prefix string found, or ""
    """
    title_lower = title.lower().strip()

    for prefix in HIRING_PREFIXES:
        if title_lower.startswith(prefix):
            return ("hiring", prefix)

    for prefix in FOR_HIRE_PREFIXES:
        if title_lower.startswith(prefix):
            return ("for_hire", prefix)

    return (None, "")


def evaluate_content(text: str, config: Dict[str, Any], title: str = "") -> Dict[str, Any]:
    """
    Evaluate if content matches rules for commercial intent.

    Checks title prefix first (fast path), then keyword matching.

    Returns:
        {
            "matched": bool,
            "keywords_found": list,
            "score": float,
            "prefix_boost": bool,  # True if a [HIRING] prefix was detected
            "reason": str
        }
    """
    text_lower = text.lower()

    # --- Step 1: Title prefix detection (highest signal) ---
    prefix_type, detected_prefix = detect_title_prefix(title)

    # Fast reject: [FOR HIRE] prefix = someone advertising themselves
    if prefix_type == "for_hire":
        return {
            "matched": False,
            "keywords_found": [],
            "score": 0,
            "prefix_boost": False,
            "reason": f"Title prefix indicates self-promotion: {detected_prefix}"
        }

    # --- Step 2: Negative keyword blocklist ---
    negative_keywords = config.get("negative_keywords", [])
    negative_found = [kw for kw in negative_keywords if kw.lower() in text_lower]

    if negative_found:
        return {
            "matched": False,
            "keywords_found": [],
            "score": 0,
            "prefix_boost": False,
            "reason": f"Negative keywords found: {negative_found}"
        }

    # --- Step 3: Positive keyword matching ---
    positive_keywords = config.get("positive_keywords", [])
    positive_found = [kw for kw in positive_keywords if kw.lower() in text_lower]

    # [HIRING] prefix counts as a strong positive signal — lowers required keywords to 1
    prefix_boost = prefix_type == "hiring"
    min_keywords = 1 if prefix_boost else 2

    matched = len(positive_found) >= min_keywords

    # Scoring: 10 pts/keyword + 20 bonus for explicit hiring prefix
    score = len(positive_found) * 10
    if prefix_boost:
        score += 20

    return {
        "matched": matched,
        "keywords_found": positive_found,
        "score": score,
        "prefix_boost": prefix_boost,
        "reason": f"Found {len(positive_found)} positive keywords (need {min_keywords})" + (
            f" | prefix: {detected_prefix}" if detected_prefix else ""
        )
    }


def should_process_post(post_score: int, min_score: int) -> bool:
    """Check if post score is above minimum threshold"""
    return post_score >= min_score
