import os
import json
from typing import Optional, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_client: Optional[OpenAI] = None


def get_openai_client() -> Optional[OpenAI]:
    """Lazy initialization of OpenAI client."""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _client = OpenAI(api_key=api_key)
    return _client


def classify_intent(title: str, body: str) -> Dict[str, Any]:
    """
    Classify the hiring intent of a Reddit post using gpt-4o-mini.

    Returns:
        {
            "intent_score": float (0.0-1.0) or None,
            "skills_needed": list[str],
            "budget_hint": str or None,
            "analysis": str or None,
            "ai_processed": bool
        }
    """
    client = get_openai_client()

    if client is None:
        return {
            "intent_score": None,
            "skills_needed": [],
            "budget_hint": None,
            "urgency_hint": None,
            "analysis": None,
            "ai_processed": False,
        }

    body_truncated = (body or "")[:1200]
    has_body = bool(body_truncated.strip()) and body_truncated.strip().lower() != title.strip().lower()

    system_prompt = """You are a classifier for a freelance opportunity monitor used by a Full-Stack Engineer & RevOps Specialist.

Their core expertise: SaaS & web development (Next.js, React, Python, Node.js, TypeScript), AI agents & chatbots (RAG, WhatsApp automation, LLMs), workflow automation (n8n, Make, Zapier), web scraping & lead generation, GTM Server-Side & Facebook CAPI tracking, CRM integrations (HubSpot, GoHighLevel/GHL, Salesforce), e-commerce (Shopify, WooCommerce), and DevOps (GCP, Docker, CI/CD).

HIGHLY RELEVANT (score 0.80–1.0) — strong match with their profile:
- Hiring a software/web/mobile developer, frontend/backend/fullstack engineer
- Building a SaaS, web app, API, automation tool, bot, chatbot, AI agent, or dashboard
- Web scraping, data extraction, lead generation automation
- CRM setup or integration (HubSpot, GoHighLevel, Salesforce), workflow automation (n8n, Make, Zapier)
- Tracking setup: GTM Server-Side, Facebook CAPI, conversion tracking, GA4, attribution
- Shopify/WooCommerce custom development or integrations
- DevOps, cloud infrastructure, CI/CD pipelines
- Freelance/contract tech work with a real project description and budget signal

RELEVANT (score 0.60–0.79):
- Hiring a designer (UI/UX), data engineer, QA engineer, or other tech professional
- Fixing bugs, adding features, integrating third-party APIs
- Tech work where details are partially unclear but clearly requires a developer

NOT RELEVANT (score 0.0–0.25):
- Looking for a co-founder or business partner (not a contractor)
- Equity-only, revenue-share-only, or sweat equity deals with no upfront payment
- Manual/non-technical tasks: surveys, data entry, transcription, social media engagement
- Self-promotion posts ([FOR HIRE], offering their own services)
- Micro-tasks under $50 with no real technical description
- Academic, school, or learning projects with no budget

UNCERTAIN (score 0.26–0.59):
- Has [HIRING] prefix but body is missing or too vague to confirm technical work
- Mentions payment but no clear technical skill required
- Could be tech work but genuinely lacks specifics

PARSING NOTES:
- HN posts often follow format "Company | Location | Remote | Stack | Role" — parse accordingly
- Budget hints: extract ranges (e.g. "$50-100/hr", "up to $5k/mo"), currencies, and retainer signals
- Urgency: detect "start immediately", "urgent", "ASAP", "this week", "immediate start", "need it done by"
- When body is empty or identical to title, score conservatively unless title explicitly names a tech stack or task"""

    user_prompt = f"""Title: {title}
Body: {body_truncated if has_body else "(no body — title only)"}

Respond with ONLY a valid JSON object:
{{
  "intent_score": <float 0.0 to 1.0>,
  "skills_needed": [<specific technical skills required; empty list if none or non-technical>],
  "budget_hint": "<budget/rate/range if mentioned, otherwise 'not mentioned'>",
  "urgency_hint": "<exactly one of: 'ASAP', 'this week', 'this month', 'flexible', 'not mentioned'>",
  "analysis": "<one sentence: what is being requested, why this score, and key signal>"
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=300,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        result["ai_processed"] = True

        # Ensure types are correct
        result["intent_score"] = float(result.get("intent_score") or 0)
        result["skills_needed"] = result.get("skills_needed") or []
        result["budget_hint"] = result.get("budget_hint") or "not mentioned"
        result["urgency_hint"] = result.get("urgency_hint") or "not mentioned"
        result["analysis"] = result.get("analysis") or ""

        return result

    except Exception as e:
        print(f"[AI Classifier] Error: {e}")
        return {
            "intent_score": None,
            "skills_needed": [],
            "budget_hint": None,
            "urgency_hint": None,
            "analysis": None,
            "ai_processed": False,
        }
