const API_BASE = "http://localhost:8000/api";

export interface Match {
  id: number;
  reddit_id: string;
  subreddit: string;
  title: string | null;
  body: string | null;
  author: string;
  score: number;
  url: string;
  created_utc: number;
  keyword_match: string[];
  rule_score: number;
  detected_at: number;
  seen: boolean;
  // AI Classification
  intent_score: number | null;
  skills_needed: string[] | null;
  budget_hint: string | null;
  urgency_hint: string | null;
  ai_analysis: string | null;
  ai_processed: boolean;
  source: string;  // "reddit" | "hackernews"
}

export interface Stats {
  total_matches: number;
  today_matches: number;
  unseen_matches: number;
  top_subreddits: { subreddit: string; count: number }[];
  ai_processed_count: number;
  avg_intent_score: number | null;
}

export type SortOrder = "newest" | "oldest" | "intent" | "composite";
export type TimeRange = "all" | "1h" | "6h" | "24h" | "7d";

export interface Config {
  positive_keywords: string[];
  negative_keywords: string[];
  subreddits: string[];
  poll_interval: number;
  min_score: number;
  // Knowledge Base
  user_bio?: string | null;
  user_skills?: string | null;
  user_hourly_rate?: string | null;
  user_portfolio_url?: string | null;
}

export interface CollectionStatus {
  is_polling: boolean;
  last_collection: string | null;
  last_collection_ago: number | null;
  next_collection: number | null;
  next_collection_in: number | null;
}

export interface FilterParams {
  subreddit?: string;
  seen?: boolean;
  limit?: number;
  source?: string;  // "reddit" | "hackernews"
}

export interface PitchDraft {
  match_id: number;
  draft: string;
  generated_at: number;
}

export interface SkillStat {
  skill: string;
  count: number;
}

export async function fetchMatches(filters?: FilterParams): Promise<Match[]> {
  const params = new URLSearchParams();

  if (filters?.subreddit) {
    params.set("subreddit", filters.subreddit);
  }
  if (filters?.seen !== undefined) {
    params.set("seen", String(filters.seen));
  }
  if (filters?.limit) {
    params.set("limit", String(filters.limit));
  }
  if (filters?.source) {
    params.set("source", filters.source);
  }

  const res = await fetch(`${API_BASE}/matches?${params}`);
  if (!res.ok) {
    throw new Error("Failed to fetch matches");
  }
  return res.json();
}

export async function markAsSeen(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/matches/${id}/seen`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Failed to mark as seen");
  }
}

export async function fetchStats(source?: string): Promise<Stats> {
  const params = source ? `?source=${source}` : "";
  const res = await fetch(`${API_BASE}/stats${params}`);
  if (!res.ok) {
    throw new Error("Failed to fetch stats");
  }
  return res.json();
}

export async function fetchConfig(): Promise<Config> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) {
    throw new Error("Failed to fetch config");
  }
  return res.json();
}

export async function updateConfig(config: Config): Promise<Config> {
  const res = await fetch(`${API_BASE}/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error("Failed to update config");
  }
  return res.json();
}

export async function triggerCollection(): Promise<{ success: boolean; stats: any }> {
  const res = await fetch(`${API_BASE}/collect`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Failed to trigger collection");
  }
  return res.json();
}

export async function fetchStatus(): Promise<CollectionStatus> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) {
    throw new Error("Failed to fetch status");
  }
  return res.json();
}

export async function generatePitch(matchId: number): Promise<PitchDraft> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/pitch`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || "Failed to generate pitch");
  }
  return res.json();
}

export async function fetchPitch(matchId: number): Promise<PitchDraft | null> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/pitch`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch pitch");
  return res.json();
}

export async function fetchSkillsAnalytics(days = 30, source?: string): Promise<{ skills: SkillStat[]; days: number }> {
  const params = new URLSearchParams({ days: String(days) });
  if (source) params.set("source", source);
  const res = await fetch(`${API_BASE}/analytics/skills?${params}`);
  if (!res.ok) throw new Error("Failed to fetch skills analytics");
  return res.json();
}

export async function markAllSeen(source?: string): Promise<{ success: boolean; marked_count: number }> {
  const params = source ? `?source=${source}` : "";
  const res = await fetch(`${API_BASE}/matches/seen-all${params}`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to mark all as seen");
  return res.json();
}

export async function regeneratePitch(matchId: number): Promise<PitchDraft> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/pitch?force=true`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || "Failed to regenerate pitch");
  }
  return res.json();
}
