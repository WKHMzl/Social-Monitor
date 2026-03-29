import re


def normalize_text(text: str) -> str:
    """
    Normalize text for analysis:
    - Convert to lowercase
    - Remove markdown formatting
    - Remove URLs
    - Normalize whitespace
    """
    if not text:
        return ""

    # Lowercase
    text = text.lower()

    # Remove URLs
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)

    # Remove markdown links [text](url)
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)

    # Remove markdown bold/italic **, *, __, _
    text = re.sub(r'[*_]{1,2}([^*_]+)[*_]{1,2}', r'\1', text)

    # Remove markdown code blocks ```
    text = re.sub(r'```[^`]*```', '', text)

    # Remove inline code `
    text = re.sub(r'`([^`]+)`', r'\1', text)

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()

    return text


def combine_post_text(title: str, body: str) -> str:
    """Combine title and body for analysis"""
    parts = []

    if title:
        parts.append(title)

    if body:
        parts.append(body)

    return " ".join(parts)
