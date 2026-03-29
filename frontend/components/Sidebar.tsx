"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stats } from "@/lib/api";

interface SidebarProps {
  subreddit: string;
  stats: Stats | null;
  isPolling: boolean;
  topSubreddits: string[];
  onSubredditChange: (subreddit: string) => void;
}

const HN_CHANNELS = [
  { id: "hn_who_is_hiring", label: "Who is Hiring" },
  { id: "hn_seeking_freelancer", label: "Seeking Freelancer" },
];

export default function Sidebar({
  subreddit,
  stats,
  isPolling,
  topSubreddits,
  onSubredditChange,
}: SidebarProps) {
  const pathname = usePathname();
  const isHNPage = pathname === "/hackernews";
  const isRedditPage = pathname === "/reddit";

  const redditSubs = topSubreddits.filter((s) => !s.startsWith("hn_")).slice(0, 8);
  const unseen = stats?.unseen_matches ?? 0;

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-white border-r border-gray-200 overflow-y-auto z-20">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">SM</span>
          </div>
          <span className="text-sm font-bold text-gray-900 tracking-tight">SocialMonitor</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          {isPolling ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-600 font-medium">Polling</span>
            </>
          ) : (
            <span className="text-xs text-gray-400">Paused</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <div className="pb-1.5 px-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sources</p>
        </div>

        {/* Hacker News */}
        <Link
          href="/hackernews"
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
            isHNPage
              ? "bg-orange-50 text-orange-700 font-semibold"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span className="text-xs font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded leading-none">HN</span>
          <span className="flex-1 text-left">Hacker News</span>
        </Link>

        {/* HN sub-items — only on HN page */}
        {isHNPage && (
          <div className="ml-3 space-y-0.5">
            <button
              onClick={() => onSubredditChange("")}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                subreddit === ""
                  ? "bg-orange-50 text-orange-700 font-semibold"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
              All threads
            </button>
            {HN_CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onSubredditChange(ch.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  subreddit === ch.id
                    ? "bg-orange-50 text-orange-700 font-semibold"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                }`}
              >
                <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
                {ch.label}
              </button>
            ))}
          </div>
        )}

        {/* Reddit */}
        <Link
          href="/reddit"
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mt-1 ${
            isRedditPage
              ? "bg-red-50 text-red-700 font-semibold"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span className="text-xs font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded leading-none">r/</span>
          <span className="flex-1 text-left">Reddit</span>
          {unseen > 0 && (
            <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center leading-none">
              {unseen > 999 ? "999+" : unseen}
            </span>
          )}
        </Link>

        {/* Reddit sub-items — only on Reddit page */}
        {isRedditPage && redditSubs.length > 0 && (
          <div className="ml-3 space-y-0.5">
            <button
              onClick={() => onSubredditChange("")}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                subreddit === ""
                  ? "bg-red-50 text-red-700 font-semibold"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
              All subreddits
            </button>
            {redditSubs.map((sub) => (
              <button
                key={sub}
                onClick={() => onSubredditChange(sub)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  subreddit === sub
                    ? "bg-red-50 text-red-700 font-semibold"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                }`}
              >
                <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
                r/{sub}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Settings — pinned at bottom */}
      <div className="px-2 pb-4 pt-3 border-t border-gray-100">
        <Link
          href="/config"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors font-medium"
        >
          <span className="text-base leading-none">⚙️</span>
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
