"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchMatches,
  fetchStats,
  fetchConfig,
  markAsSeen,
  markAllSeen,
  fetchStatus,
  triggerCollection,
  Match,
  Stats,
  CollectionStatus,
  SortOrder,
  TimeRange,
} from "@/lib/api";
import MatchCard from "@/components/MatchCard";
import FilterBar from "@/components/FilterBar";
import StatsPanel from "@/components/StatsPanel";
import SkillsPanel from "@/components/SkillsPanel";
import Sidebar from "@/components/Sidebar";

/** Compute a composite match score (0.0 – 1.0) from AI fields + user skills */
function computeCompositeScore(match: Match, userSkills: string[]): number {
  const intentComp = (match.intent_score ?? 0) * 0.5;
  const budgetComp =
    match.budget_hint &&
    match.budget_hint !== "not mentioned" &&
    match.budget_hint !== ""
      ? 0.3
      : 0;
  let skillComp = 0;
  if (userSkills.length > 0 && match.skills_needed && match.skills_needed.length > 0) {
    const matched = match.skills_needed.filter((skill) =>
      userSkills.some(
        (us) =>
          skill.toLowerCase().includes(us.toLowerCase()) ||
          us.toLowerCase().includes(skill.toLowerCase())
      )
    ).length;
    skillComp = (matched / match.skills_needed.length) * 0.2;
  }
  return intentComp + budgetComp + skillComp;
}

/** Returns the cutoff unix timestamp for a given TimeRange (null = no cutoff) */
function getTimeRangeCutoff(timeRange: TimeRange): number | null {
  const now = Math.floor(Date.now() / 1000);
  switch (timeRange) {
    case "1h":  return now - 3600;
    case "6h":  return now - 3600 * 6;
    case "24h": return now - 3600 * 24;
    case "7d":  return now - 3600 * 24 * 7;
    default:    return null;
  }
}

interface QuickFilterState {
  seen: string;
  timeRange: TimeRange;
  sortOrder: SortOrder;
  skillFilter: string;
  subreddit: string;
}

// HN-specific quick filters
const QUICK_FILTERS: { label: string; apply: () => QuickFilterState }[] = [
  {
    label: "Seeking Freelancer",
    apply: () => ({ seen: "false", timeRange: "all", sortOrder: "composite", skillFilter: "", subreddit: "hn_seeking_freelancer" }),
  },
  {
    label: "Who is Hiring",
    apply: () => ({ seen: "false", timeRange: "all", sortOrder: "newest", skillFilter: "", subreddit: "hn_who_is_hiring" }),
  },
  {
    label: "Fresh unseen",
    apply: () => ({ seen: "false", timeRange: "6h", sortOrder: "composite", skillFilter: "", subreddit: "" }),
  },
  {
    label: "High intent",
    apply: () => ({ seen: "", timeRange: "24h", sortOrder: "intent", skillFilter: "", subreddit: "" }),
  },
];

export default function HackerNewsDashboard() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);

  // Filters — "subreddit" here means HN channel (hn_who_is_hiring | hn_seeking_freelancer | "")
  // source is always "hackernews" on this page
  const [subreddit, setSubreddit] = useState("");
  const [seen, setSeen] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [skillFilter, setSkillFilter] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  // User skills from config (for composite score + skill highlight)
  const [userSkillsList, setUserSkillsList] = useState<string[]>([]);

  // Browser notifications
  const [mounted, setMounted] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsDenied, setNotificationsDenied] = useState(false);
  const [previousUnseenCount, setPreviousUnseenCount] = useState(0);

  // Load user skills once on mount
  useEffect(() => {
    fetchConfig()
      .then((cfg) => {
        if (cfg.user_skills) {
          setUserSkillsList(
            cfg.user_skills.split(",").map((s) => s.trim()).filter(Boolean)
          );
        }
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    try {
      setError(null);

      // Always filter for HackerNews on this page
      const filterParams: Record<string, unknown> = { source: "hackernews" };
      if (subreddit) filterParams.subreddit = subreddit;
      if (seen) filterParams.seen = seen === "true";

      const [matchesData, statsData, statusData] = await Promise.all([
        fetchMatches(filterParams as Parameters<typeof fetchMatches>[0]),
        fetchStats("hackernews"),
        fetchStatus(),
      ]);

      // Time range filter (client-side)
      let filtered = matchesData;
      const cutoff = getTimeRangeCutoff(timeRange);
      if (cutoff !== null) {
        filtered = filtered.filter((m) => m.created_utc >= cutoff);
      }

      // Skill filter (client-side)
      if (skillFilter.trim()) {
        filtered = filtered.filter((m) =>
          m.skills_needed?.some((s) =>
            s.toLowerCase().includes(skillFilter.toLowerCase())
          )
        );
      }

      // Sort
      const sortedMatches = [...filtered].sort((a, b) => {
        if (sortOrder === "composite") {
          return computeCompositeScore(b, userSkillsList) - computeCompositeScore(a, userSkillsList);
        } else if (sortOrder === "intent") {
          return (b.intent_score ?? -1) - (a.intent_score ?? -1);
        } else if (sortOrder === "newest") {
          return b.created_utc - a.created_utc;
        } else {
          return a.created_utc - b.created_utc;
        }
      });

      setMatches(sortedMatches);
      setStats(statsData);
      setStatus(statusData);

      // Browser notification for new unseen
      if (
        !loading &&
        notificationsEnabled &&
        statsData.unseen_matches > previousUnseenCount &&
        previousUnseenCount > 0
      ) {
        showBrowserNotification(statsData.unseen_matches - previousUnseenCount);
      }
      setPreviousUnseenCount(statsData.unseen_matches);

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subreddit, seen, sortOrder, skillFilter, timeRange, userSkillsList, notificationsEnabled, previousUnseenCount]);

  // Mount flag + notification permission check
  useEffect(() => {
    setMounted(true);
    if ("Notification" in window) {
      if (Notification.permission === "granted") setNotificationsEnabled(true);
      else if (Notification.permission === "denied") setNotificationsDenied(true);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when filters change
  useEffect(() => {
    if (!loading) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subreddit, seen, sortOrder, skillFilter, timeRange]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subreddit, seen, sortOrder, skillFilter, timeRange]);

  // Status refresh every 5s
  useEffect(() => {
    const interval = setInterval(async () => {
      try { setStatus(await fetchStatus()); } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkSeen = async (id: number) => {
    try {
      await markAsSeen(id);
      setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, seen: true } : m)));
      setStats(await fetchStats("hackernews"));
    } catch (err) {
      console.error("Failed to mark as seen:", err);
    }
  };

  const handleMarkAllSeen = async () => {
    try {
      await markAllSeen("hackernews");
      setMatches((prev) => prev.map((m) => ({ ...m, seen: true })));
      setStats(await fetchStats("hackernews"));
    } catch (err) {
      console.error("Failed to mark all as seen:", err);
    }
  };

  const handleCollectNow = async () => {
    setCollecting(true);
    try {
      await triggerCollection();
      await loadData();
    } catch {
      setError("Failed to trigger collection");
    } finally {
      setCollecting(false);
    }
  };

  const applyQuickFilter = (qf: QuickFilterState) => {
    setSubreddit(qf.subreddit);
    setSeen(qf.seen);
    setSortOrder(qf.sortOrder);
    setSkillFilter(qf.skillFilter);
    setTimeRange(qf.timeRange);
  };

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setNotificationsEnabled(true);
        setNotificationsDenied(false);
        showBrowserNotification(1, true);
      } else if (perm === "denied") {
        setNotificationsDenied(true);
        setNotificationsEnabled(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const showBrowserNotification = (count: number, isTest = false) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const n = new Notification(
        isTest ? "Notifications Enabled!" : "SocialMonitor - New HN Opportunities!",
        {
          body: isTest
            ? "You'll be notified when new HN opportunities are found."
            : `${count} new Hacker News ${count === 1 ? "opportunity" : "opportunities"} detected!`,
          icon: "/favicon.ico",
          tag: "social-monitor-hn",
          requireInteraction: false,
        }
      );
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 5000);
    }
  };

  const formatTimeAgo = (seconds: number | null) => {
    if (seconds === null) return "Never";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const formatTimeRemaining = (seconds: number | null) => {
    if (seconds === null) return "Unknown";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  const hasActiveFilters = !!(seen || skillFilter || timeRange !== "all" || sortOrder !== "newest" || subreddit);

  const activeChannelLabel =
    subreddit === "hn_who_is_hiring" ? "Who is Hiring" :
    subreddit === "hn_seeking_freelancer" ? "Seeking Freelancer" :
    null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar — passes empty topSubreddits since HN channels are hardcoded in Sidebar */}
      <Sidebar
        subreddit={subreddit}
        stats={stats}
        isPolling={status?.is_polling ?? false}
        topSubreddits={[]}
        onSubredditChange={setSubreddit}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header — orange HN theme */}
        <header className="bg-orange-600 border-b border-orange-700 sticky top-0 z-10 shadow-sm">
          <div className="px-4 py-3 flex justify-between items-center gap-4">
            {/* Title + status */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-white text-orange-600 px-1.5 py-0.5 rounded leading-none">HN</span>
                <h1 className="text-sm font-bold text-white">Hacker News · Opportunities</h1>
              </div>
              <div className="text-xs text-orange-200 mt-0.5">
                {status ? (
                  <span>
                    Last collected: {formatTimeAgo(status.last_collection_ago)}
                    {status.next_collection_in !== null && (
                      <> · Next in {formatTimeRemaining(status.next_collection_in)}</>
                    )}
                  </span>
                ) : (
                  <span>Connecting...</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 items-center shrink-0">
              {notificationsEnabled && (
                <div className="flex items-center gap-1 text-xs text-white bg-orange-500 px-3 py-1.5 rounded-full border border-orange-400">
                  🔔 Notifications ON
                </div>
              )}
              {mounted && !notificationsEnabled && !notificationsDenied && "Notification" in window && (
                <button
                  onClick={requestNotificationPermission}
                  className="text-xs text-orange-900 bg-yellow-100 hover:bg-yellow-200 border border-yellow-300 px-3 py-1.5 rounded-full"
                >
                  🔕 Enable Notifications
                </button>
              )}
              {notificationsDenied && (
                <div
                  className="flex items-center gap-1 text-xs text-white bg-red-500 px-3 py-1.5 rounded-full border border-red-400"
                  title="Notifications blocked. Enable them in browser settings."
                >
                  🔕 Blocked
                </div>
              )}
              {stats && stats.unseen_matches > 0 && (
                <button
                  onClick={handleMarkAllSeen}
                  className="text-xs text-orange-700 bg-white hover:bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full font-medium transition-colors"
                >
                  ✓ Mark all seen ({stats.unseen_matches})
                </button>
              )}
              <button
                onClick={handleCollectNow}
                disabled={collecting}
                className="bg-white hover:bg-orange-50 disabled:bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border border-orange-200"
              >
                {collecting ? "Collecting..." : "Collect Now"}
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-5">
          <StatsPanel stats={stats} loading={loading} source="hackernews" />
          <SkillsPanel onSkillClick={(skill) => setSkillFilter(skill)} source="hackernews" />

          {/* Quick Filters */}
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <span className="text-xs text-gray-400 font-medium">Quick:</span>
            {QUICK_FILTERS.map((qf) => (
              <button
                key={qf.label}
                onClick={() => applyQuickFilter(qf.apply())}
                className="text-xs px-3 py-1.5 rounded-full border border-orange-200 bg-white text-orange-700 hover:bg-orange-50 hover:border-orange-300 transition-colors"
              >
                {qf.label}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSeen("");
                  setSortOrder("newest");
                  setSkillFilter("");
                  setTimeRange("all");
                  setSubreddit("");
                }}
                className="text-xs px-3 py-1.5 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                × Clear filters
              </button>
            )}
          </div>

          <FilterBar
            seen={seen}
            sortOrder={sortOrder}
            skillFilter={skillFilter}
            timeRange={timeRange}
            onSeenChange={setSeen}
            onSortOrderChange={setSortOrder}
            onSkillFilterChange={setSkillFilter}
            onTimeRangeChange={setTimeRange}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-medium">Connection error</p>
              <p className="text-red-600 text-sm mt-1">
                Make sure the backend is running at{" "}
                <code className="bg-red-100 px-1 rounded">http://localhost:8000</code>
              </p>
              <button
                onClick={loadData}
                className="mt-2 bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-16">
              <div className="text-gray-400 text-sm">Loading HN opportunities...</div>
            </div>
          )}

          {!loading && !error && matches.length === 0 && (
            <div className="bg-white border border-orange-200 rounded-lg p-10 text-center">
              <div className="text-4xl mb-3">🔶</div>
              <p className="text-gray-600 font-medium mb-1">No HN matches found</p>
              <p className="text-gray-400 text-sm">
                {skillFilter
                  ? `No HN posts with skill "${skillFilter}" detected yet.`
                  : timeRange !== "all"
                  ? "No matches in the selected time range. Try expanding the filter."
                  : subreddit === "hn_seeking_freelancer"
                  ? "No 'Seeking Freelancer' posts found. Click 'Collect Now' to fetch the latest HN threads."
                  : "No HN matches yet. Click 'Collect Now' to fetch the latest monthly hiring threads."}
              </p>
            </div>
          )}

          {!loading && matches.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-400 mb-1">
                Showing <strong className="text-gray-600">{matches.length}</strong>{" "}
                {matches.length === 1 ? "match" : "matches"}
                {activeChannelLabel && (
                  <span className="ml-1 font-medium text-orange-600">· {activeChannelLabel}</span>
                )}
                {seen === "false" && " · unseen only"}
                {seen === "true" && " · seen only"}
                {timeRange !== "all" && ` · ${timeRange}`}
                {skillFilter && ` · skill: "${skillFilter}"`}
                {userSkillsList.length > 0 && sortOrder === "composite" && (
                  <span className="ml-1 text-purple-500">· sorted by composite score</span>
                )}
              </div>

              {matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onMarkSeen={handleMarkSeen}
                  userSkills={userSkillsList}
                  compositeScore={
                    match.ai_processed
                      ? computeCompositeScore(match, userSkillsList)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </main>

        <footer className="px-4 py-4 text-center text-xs text-gray-400 border-t border-gray-200">
          Auto-refreshes every 30s · HN Monthly Threads · 2 channels (Who is Hiring · Seeking Freelancer)
        </footer>
      </div>
    </div>
  );
}
