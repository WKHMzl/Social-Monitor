import os
from typing import Optional, List
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


def generate_pitch(
    post_title: str,
    post_body: str,
    skills_needed: List[str],
    user_bio: Optional[str],
    user_skills: Optional[str],
    user_hourly_rate: Optional[str],
    user_portfolio_url: Optional[str],
) -> Optional[str]:
    """
    Generate a personalized pitch draft for a Reddit opportunity.

    Returns:
        Pitch text string, or None if OpenAI is not configured or fails.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    client = OpenAI(api_key=api_key)

    # Build freelancer context
    profile_lines = []
    if user_bio:
        profile_lines.append(f"Bio: {user_bio}")
    if user_skills:
        profile_lines.append(f"Skills: {user_skills}")
    if user_hourly_rate:
        profile_lines.append(f"Rate: {user_hourly_rate}")
    if user_portfolio_url:
        profile_lines.append(f"Portfolio: {user_portfolio_url}")

    profile_context = "\n".join(profile_lines) if profile_lines else "No profile configured."
    skills_str = ", ".join(skills_needed) if skills_needed else "not specified"
    body_truncated = (post_body or "")[:1500]

    prompt = f"""You are an expert copywriter helping a freelance developer write a high-converting reply to a contract/freelance opportunity.

OPPORTUNITY:
Title: {post_title}
Body: {body_truncated}
Skills needed (AI-detected): {skills_str}

FREELANCER PROFILE:
{profile_context}

Write a concise, personalized pitch reply following these rules:

1. OPENING: Start by acknowledging their specific problem or goal — not your own background.
   BAD: "I'm a developer with 6 years of experience..."
   GOOD: "Automating your lead gen pipeline from Google Maps sounds like exactly the kind of system I've built before..."

2. RELEVANCE: Mention 1-2 specific skills or past experiences from the profile that directly match what they need. Be concrete, not generic.

3. BUSINESS CONTEXT: Show you understand the business goal behind the request (growth, efficiency, revenue, speed) — not just the technical spec.

4. CTA: End with one clear, low-friction call to action (suggest a DM, a quick call, or sharing more details).

5. LENGTH: 3 to 5 sentences maximum. Busy founders skim — be direct.

6. TONE: Peer-to-peer. Confident but not arrogant. No buzzwords, no overselling, no desperation.

7. FORMAT: Write only the pitch text. No subject line. No signature. No placeholders like [your name].
   Do NOT start with: "Hi there!", "Hello!", "I saw your post", "I'm interested in your project", "Great post"."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=400,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"[Pitch Generator] Error: {e}")
        return None
