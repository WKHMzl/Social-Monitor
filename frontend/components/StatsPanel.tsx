"use client";

import { Stats } from "@/lib/api";

interface StatsPanelProps {
  stats: Stats | null;
  loading: boolean;
  source?: string; // "reddit" | "hackernews"
}

/** Format a channel/subreddit name for display based on source. */
function channelLabel(subreddit: string, source?: string): string {
  if (source === "hackernews" || subreddit.startsWith("hn_")) {
    if (subreddit === "hn_who_is_hiring") return "HN · Who is Hiring";
    if (subreddit === "hn_seeking_freelancer") return "HN · Seeking Freelancer";
    return `HN · ${subreddit}`;
  }
  return `r/${subreddit}`;
}

export default function StatsPanel({ stats, loading, source }: StatsPanelProps) {
  if (loading) {
    return (
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const intentPercent =
    stats.avg_intent_score != null
      ? Math.round(stats.avg_intent_score * 100)
      : null;

  const intentColor =
    intentPercent == null
      ? "text-purple-400"
      : intentPercent >= 70
      ? "text-green-700"
      : intentPercent >= 40
      ? "text-yellow-700"
      : "text-red-600";

  return (
    <div className="space-y-3 mb-6">
      {/* Main stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
            Total
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.total_matches}</div>
          <div className="text-xs text-gray-400 mt-1">matches ever</div>
        </div>

        {/* Last 24h */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-xs font-medium text-blue-500 uppercase tracking-wide mb-1">
            Last 24h
          </div>
          <div className="text-3xl font-bold text-blue-900">{stats.today_matches}</div>
          <div className="text-xs text-blue-400 mt-1">new matches</div>
        </div>

        {/* Unseen */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-xs font-medium text-green-500 uppercase tracking-wide mb-1">
            Unseen
          </div>
          <div className="text-3xl font-bold text-green-900">{stats.unseen_matches}</div>
          <div className="text-xs text-green-400 mt-1">to review</div>
        </div>

        {/* AI Analyzed */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-xs font-medium text-purple-500 uppercase tracking-wide mb-1">
            AI Analyzed
          </div>
          <div className="text-3xl font-bold text-purple-900">{stats.ai_processed_count}</div>
          {intentPercent !== null ? (
            <div className={`text-xs mt-1 font-medium ${intentColor}`}>
              avg intent {intentPercent}%
            </div>
          ) : (
            <div className="text-xs text-purple-300 mt-1">no AI data yet</div>
          )}
        </div>
      </div>

      {/* Top subreddits */}
      {stats.top_subreddits.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Top Sources
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.top_subreddits.map((item, idx) => (
              <div
                key={item.subreddit}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-sm"
              >
                {idx === 0 && <span className="text-yellow-500">★</span>}
                <span className="font-medium text-gray-800">{channelLabel(item.subreddit, source)}</span>
                <span className="text-gray-400 text-xs bg-gray-200 rounded-full px-1.5">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
