"use client";

import { useEffect, useState } from "react";
import { fetchSkillsAnalytics, SkillStat } from "@/lib/api";

const DAY_OPTIONS = [7, 14, 30];

interface SkillsPanelProps {
  onSkillClick?: (skill: string) => void;
  source?: string; // "reddit" | "hackernews"
}

export default function SkillsPanel({ onSkillClick, source }: SkillsPanelProps) {
  const [skills, setSkills] = useState<SkillStat[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSkillsAnalytics(days, source)
      .then((data) => {
        setSkills(Array.isArray(data.skills) ? data.skills : []);
      })
      .catch((err) => {
        setError(err?.message ?? "unknown error");
        setSkills([]);
      })
      .finally(() => setLoading(false));
  }, [days, source]);

  const maxCount = skills[0]?.count ?? 1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
          Top Skills in Demand
        </h2>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                days === d
                  ? "bg-purple-100 text-purple-700 border-purple-200 font-medium"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-24 h-3 bg-gray-200 rounded" />
              <div className="flex-1 h-3 bg-gray-100 rounded" />
              <div className="w-6 h-3 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-red-500 py-2">
          Erro ao carregar skills: {error}
        </p>
      )}

      {!loading && !error && skills.length === 0 && (
        <p className="text-xs text-gray-500 py-2">
          Nenhuma skill detectada no período selecionado. Habilite o OPENAI_API_KEY para análise de skills.
        </p>
      )}

      {!loading && skills.length > 0 && (
        <div className="space-y-1.5">
          {skills.slice(0, 15).map((item, idx) => {
            const pct = Math.round((item.count / maxCount) * 100);
            const barColor =
              idx === 0
                ? "bg-purple-500"
                : idx < 3
                ? "bg-purple-400"
                : idx < 7
                ? "bg-purple-300"
                : "bg-gray-200";

            return (
              <div
                key={item.skill}
                className={`flex items-center gap-2 rounded px-1 -mx-1 transition-colors ${
                  onSkillClick
                    ? "cursor-pointer hover:bg-purple-50"
                    : ""
                }`}
                onClick={() => onSkillClick?.(item.skill)}
                title={onSkillClick ? `Filter by "${item.skill}"` : item.skill}
              >
                <span className="text-xs text-gray-700 w-28 truncate capitalize">
                  {item.skill}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-6 text-right">{item.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
