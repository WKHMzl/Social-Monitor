"use client";

import { SortOrder, TimeRange } from "@/lib/api";

interface FilterBarProps {
  seen: string;
  sortOrder: SortOrder;
  skillFilter: string;
  timeRange: TimeRange;
  onSeenChange: (value: string) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onSkillFilterChange: (value: string) => void;
  onTimeRangeChange: (value: TimeRange) => void;
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "1h", label: "Last Hour" },
  { value: "6h", label: "Last 6h" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
];

export default function FilterBar({
  seen,
  sortOrder,
  skillFilter,
  timeRange,
  onSeenChange,
  onSortOrderChange,
  onSkillFilterChange,
  onTimeRangeChange,
}: FilterBarProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex gap-3 items-end flex-wrap">

        {/* Status */}
        <div className="flex-1 min-w-28">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
            Status
          </label>
          <select
            value={seen}
            onChange={(e) => onSeenChange(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-800"
          >
            <option value="">All</option>
            <option value="false">Unseen Only</option>
            <option value="true">Seen Only</option>
          </select>
        </div>

        {/* Age */}
        <div className="flex-1 min-w-28">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
            Age
          </label>
          <select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-800"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div className="flex-1 min-w-36">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
            Sort By
          </label>
          <select
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-800"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="intent">AI Intent Score</option>
            <option value="composite">Best Match (Composite)</option>
          </select>
        </div>

        {/* Skill filter */}
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
            Filter by Skill
          </label>
          <div className="relative">
            <input
              type="text"
              value={skillFilter}
              onChange={(e) => onSkillFilterChange(e.target.value)}
              placeholder="React, Python, Node..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm pr-8 text-gray-800 placeholder:text-gray-400"
            />
            {skillFilter && (
              <button
                onClick={() => onSkillFilterChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
