"use client";

import { useState } from "react";
import { Match, PitchDraft, generatePitch, regeneratePitch } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface MatchCardProps {
  match: Match;
  onMarkSeen: (id: number) => void;
  userSkills?: string[];
  compositeScore?: number;
}

function skillMatches(skill: string, userSkills: string[]): boolean {
  return userSkills.some(
    (us) =>
      skill.toLowerCase().includes(us.toLowerCase()) ||
      us.toLowerCase().includes(skill.toLowerCase())
  );
}

/** Format channel display: Reddit → r/subreddit, HN → HN · Thread Name */
function channelDisplay(subreddit: string, source: string): string {
  if (source === "hackernews") {
    if (subreddit === "hn_who_is_hiring") return "HN · Who is Hiring";
    if (subreddit === "hn_seeking_freelancer") return "HN · Seeking Freelancer";
    return `HN · ${subreddit}`;
  }
  return `r/${subreddit}`;
}

function SourceBadge({ source }: { source: string }) {
  if (source === "hackernews") {
    return (
      <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-semibold">
        🔶 HN
      </span>
    );
  }
  return null; // Reddit is default, no badge needed
}

function UrgencyBadge({ hint }: { hint: string | null }) {
  if (!hint || hint === "not mentioned" || hint === "flexible") return null;
  const isASAP = hint.toLowerCase() === "asap";
  const isThisWeek = hint.toLowerCase().includes("week");
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
        isASAP
          ? "bg-red-100 text-red-700 border border-red-200"
          : isThisWeek
          ? "bg-orange-100 text-orange-700 border border-orange-200"
          : "bg-gray-100 text-gray-600 border border-gray-200"
      }`}
    >
      ⏱ {hint}
    </span>
  );
}

/** Returns freshness tier based on post age in seconds */
function getFreshness(createdUtc: number): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  const ageSeconds = Math.floor(Date.now() / 1000) - createdUtc;
  const ageHours = ageSeconds / 3600;

  if (ageHours < 1) {
    return { label: "< 1h ago", dotClass: "bg-green-400", textClass: "text-green-600" };
  } else if (ageHours < 6) {
    return { label: `${Math.floor(ageHours)}h ago`, dotClass: "bg-yellow-400", textClass: "text-yellow-600" };
  } else if (ageHours < 24) {
    return { label: `${Math.floor(ageHours)}h ago`, dotClass: "bg-orange-400", textClass: "text-orange-600" };
  } else {
    const days = Math.floor(ageHours / 24);
    return { label: `${days}d ago`, dotClass: "bg-red-400", textClass: "text-red-500" };
  }
}

export default function MatchCard({
  match,
  onMarkSeen,
  userSkills = [],
  compositeScore,
}: MatchCardProps) {
  const createdDate = new Date(match.created_utc * 1000);
  const detectedDate = new Date(match.detected_at * 1000);
  const freshness = getFreshness(match.created_utc);

  const snippet = match.body
    ? match.body.slice(0, 220) + (match.body.length > 220 ? "..." : "")
    : match.title
    ? match.title.slice(0, 220)
    : "No content";

  // Pitch state
  const [pitchDraft, setPitchDraft] = useState<PitchDraft | null>(null);
  const [pitchText, setPitchText] = useState("");
  const [pitchVisible, setPitchVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGeneratePitch = async () => {
    setGenerating(true);
    setPitchError(null);
    try {
      const draft = await generatePitch(match.id);
      setPitchDraft(draft);
      setPitchText(draft.draft);
      setPitchVisible(true);
    } catch (err) {
      setPitchError(err instanceof Error ? err.message : "Failed to generate pitch");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPitch = async () => {
    await navigator.clipboard.writeText(pitchText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegeneratePitch = async () => {
    setGenerating(true);
    setPitchError(null);
    try {
      const draft = await regeneratePitch(match.id);
      setPitchDraft(draft);
      setPitchText(draft.draft);
      setPitchVisible(true);
    } catch (err) {
      setPitchError(err instanceof Error ? err.message : "Failed to regenerate pitch");
    } finally {
      setGenerating(false);
    }
  };

  // Intent score bar color
  const intentColor =
    match.intent_score == null
      ? "bg-gray-300"
      : match.intent_score >= 0.7
      ? "bg-green-500"
      : match.intent_score >= 0.4
      ? "bg-yellow-500"
      : "bg-red-400";

  // Composite score badge styling
  const compositeLabel =
    compositeScore != null ? Math.round(compositeScore * 100) : null;
  const compositeBadgeClass =
    compositeLabel == null
      ? ""
      : compositeLabel >= 70
      ? "bg-green-100 text-green-800 border-green-200"
      : compositeLabel >= 40
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-gray-100 text-gray-600 border-gray-200";

  // Skill match count for summary
  const matchedSkillsCount =
    match.skills_needed && userSkills.length > 0
      ? match.skills_needed.filter((s) => skillMatches(s, userSkills)).length
      : 0;

  const cardBorder = match.seen
    ? "border-gray-200 bg-gray-50"
    : compositeLabel != null && compositeLabel >= 70
    ? "border-green-300 bg-white"
    : "border-blue-200 bg-white";

  return (
    <div className={`border rounded-xl p-4 transition-all ${cardBorder}`}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-gray-900 leading-snug truncate">
            {match.title || "[No title]"}
          </h3>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center text-xs text-gray-500 mt-1">
            <span className="font-semibold text-gray-700">
              {channelDisplay(match.subreddit, match.source ?? "reddit")}
            </span>
            {match.source === "hackernews" && <SourceBadge source={match.source} />}
            <span>·</span>
            <span>u/{match.author}</span>
            <span>·</span>
            <span>{match.score} pts</span>
            <span>·</span>
            {/* Freshness indicator */}
            <span className={`flex items-center gap-1 font-medium ${freshness.textClass}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${freshness.dotClass}`} />
              {freshness.label}
            </span>
            {match.urgency_hint && match.urgency_hint !== "not mentioned" && (
              <>
                <span>·</span>
                <UrgencyBadge hint={match.urgency_hint} />
              </>
            )}
          </div>
        </div>

        {/* Right badges */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {compositeLabel != null && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${compositeBadgeClass}`}
              title="Composite score = intent (50%) + budget (30%) + skill match (20%)"
            >
              {compositeLabel}% match
            </span>
          )}
          {!match.seen && (
            <span className="bg-blue-500 text-white text-xs px-2.5 py-0.5 rounded-full">
              New
            </span>
          )}
        </div>
      </div>

      {/* ── Snippet ── */}
      <p className="text-gray-600 text-sm mb-3 line-clamp-2 leading-relaxed">
        {snippet}
      </p>

      {/* ── Keyword chips ── */}
      <div className="flex flex-wrap gap-1 mb-3">
        {match.keyword_match.map((keyword, idx) => (
          <span
            key={idx}
            className="bg-green-50 text-green-700 border border-green-200 text-xs px-2 py-0.5 rounded-full"
          >
            {keyword}
          </span>
        ))}
      </div>

      {/* ── AI Analysis section ── */}
      {match.ai_processed && (
        <div className="mb-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
          {/* Row: label + intent bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">
              AI Analysis
            </span>
            <div className="flex items-center gap-3">
              {match.intent_score != null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-purple-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${intentColor}`}
                      style={{ width: `${Math.round(match.intent_score * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-purple-800">
                    {Math.round(match.intent_score * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Analysis sentence */}
          {match.ai_analysis && (
            <p className="text-xs text-purple-800 mb-2 italic leading-relaxed">
              {match.ai_analysis}
            </p>
          )}

          {/* Skills + budget + skill match summary */}
          <div className="flex flex-wrap gap-1 items-center">
            {match.skills_needed &&
              match.skills_needed.map((skill, idx) => {
                const isMatch = userSkills.length > 0 && skillMatches(skill, userSkills);
                return (
                  <span
                    key={idx}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      isMatch
                        ? "bg-green-100 text-green-800 border border-green-300"
                        : "bg-purple-100 text-purple-700"
                    }`}
                    title={isMatch ? "Matches your skills" : ""}
                  >
                    {isMatch ? "✓ " : ""}
                    {skill}
                  </span>
                );
              })}
            {match.budget_hint && match.budget_hint !== "not mentioned" && (
              <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                💰 {match.budget_hint}
              </span>
            )}
            {userSkills.length > 0 &&
              match.skills_needed &&
              match.skills_needed.length > 0 && (
                <span className="text-xs text-purple-400 ml-1">
                  {matchedSkillsCount}/{match.skills_needed.length} skills match
                </span>
              )}
          </div>
        </div>
      )}

      {/* ── Pitch Draft section ── */}
      {pitchVisible && pitchDraft && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Draft Pitch
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={handleRegeneratePitch}
                disabled={generating}
                className="text-xs px-3 py-1 rounded-full font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 disabled:opacity-40"
                title="Generate a new version"
              >
                {generating ? "..." : "↺ Regenerate"}
              </button>
              <button
                onClick={handleCopyPitch}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                  copied
                    ? "bg-green-100 text-green-700 border border-green-200"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200"
                }`}
              >
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <textarea
            value={pitchText}
            onChange={(e) => setPitchText(e.target.value)}
            rows={6}
            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
          />
          <p className="text-xs text-amber-500 mt-1">
            Editable — changes are local to this session
          </p>
        </div>
      )}

      {pitchError && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {pitchError}
        </div>
      )}

      {/* ── Footer + Actions ── */}
      <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-400">
          Posted {formatDistanceToNow(createdDate, { addSuffix: true })} ·
          Found {formatDistanceToNow(detectedDate, { addSuffix: true })}
        </div>
        <div className="text-xs text-gray-400">kw score: {match.rule_score}</div>
      </div>

      <div className="flex gap-2 mt-2 flex-wrap">
        <a
          href={match.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
        >
          {match.source === "hackernews" ? "Open on HN ↗" : "Open on Reddit ↗"}
        </a>
        {!match.seen && (
          <button
            onClick={() => onMarkSeen(match.id)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
          >
            Mark Seen
          </button>
        )}
        <button
          onClick={
            pitchVisible
              ? () => setPitchVisible(false)
              : pitchDraft
              ? () => setPitchVisible(true)
              : handleGeneratePitch
          }
          disabled={generating}
          className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
        >
          {generating
            ? "Generating..."
            : pitchVisible
            ? "Hide Pitch"
            : pitchDraft
            ? "Show Pitch"
            : "Generate Pitch"}
        </button>
      </div>
    </div>
  );
}
