"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchConfig, updateConfig, triggerCollection, Config } from "@/lib/api";

export default function ConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  // Form state - keywords & settings
  const [positiveKeywords, setPositiveKeywords] = useState("");
  const [negativeKeywords, setNegativeKeywords] = useState("");
  const [subreddits, setSubreddits] = useState("");
  const [pollInterval, setPollInterval] = useState(300);
  const [minScore, setMinScore] = useState(-5);

  // Form state - Knowledge Base
  const [userBio, setUserBio] = useState("");
  const [userSkills, setUserSkills] = useState("");
  const [userHourlyRate, setUserHourlyRate] = useState("");
  const [userPortfolioUrl, setUserPortfolioUrl] = useState("");

  // Load config
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await fetchConfig();
      setConfig(data);

      // Populate form
      setPositiveKeywords(data.positive_keywords.join("\n"));
      setNegativeKeywords(data.negative_keywords.join("\n"));
      setSubreddits(data.subreddits.join(", "));
      setPollInterval(data.poll_interval);
      setMinScore(data.min_score);

      // Populate Knowledge Base
      setUserBio(data.user_bio ?? "");
      setUserSkills(data.user_skills ?? "");
      setUserHourlyRate(data.user_hourly_rate ?? "");
      setUserPortfolioUrl(data.user_portfolio_url ?? "");

      setLoading(false);
    } catch (err) {
      setMessage({
        type: "error",
        text: "Failed to load config. Make sure backend is running.",
      });
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const newConfig: Config = {
        positive_keywords: positiveKeywords
          .split("\n")
          .map((k) => k.trim())
          .filter(Boolean),
        negative_keywords: negativeKeywords
          .split("\n")
          .map((k) => k.trim())
          .filter(Boolean),
        subreddits: subreddits
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        poll_interval: pollInterval,
        min_score: minScore,
        // Knowledge Base
        user_bio: userBio || null,
        user_skills: userSkills || null,
        user_hourly_rate: userHourlyRate || null,
        user_portfolio_url: userPortfolioUrl || null,
      };

      await updateConfig(newConfig);
      setConfig(newConfig);
      setMessage({ type: "success", text: "Configuration saved successfully!" });
    } catch (err) {
      setMessage({ type: "error", text: "Failed to save configuration" });
    } finally {
      setSaving(false);
    }
  };

  const handleCollectNow = async () => {
    setCollecting(true);
    setMessage(null);

    try {
      const result = await triggerCollection();
      setMessage({
        type: "success",
        text: `Collection completed! Found ${result.stats.matches_found} new matches from ${result.stats.posts_checked} posts.`,
      });
    } catch (err) {
      setMessage({ type: "error", text: "Failed to trigger collection" });
    } finally {
      setCollecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          <Link
            href="/"
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Message */}
        {message && (
          <div
            className={`rounded-lg p-4 mb-6 ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
          {/* Positive Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Positive Keywords
              <span className="ml-2 font-normal text-gray-500">
                (one per line, requires 2+ matches)
              </span>
            </label>
            <textarea
              value={positiveKeywords}
              onChange={(e) => setPositiveKeywords(e.target.value)}
              rows={10}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono text-gray-800 placeholder:text-gray-400"
              placeholder="need help&#10;looking for&#10;hiring&#10;freelance"
            />
          </div>

          {/* Negative Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Negative Keywords (Blocklist)
              <span className="ml-2 font-normal text-gray-500">
                (one per line, any match blocks the post)
              </span>
            </label>
            <textarea
              value={negativeKeywords}
              onChange={(e) => setNegativeKeywords(e.target.value)}
              rows={5}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono text-gray-800 placeholder:text-gray-400"
              placeholder="unpaid&#10;exposure&#10;free work"
            />
          </div>

          {/* Subreddits */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subreddits to Monitor
              <span className="ml-2 font-normal text-gray-500">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={subreddits}
              onChange={(e) => setSubreddits(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
              placeholder="freelance, forhire, freelance_forhire"
            />
          </div>

          {/* Poll Interval */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Polling Interval (seconds)
            </label>
            <input
              type="number"
              value={pollInterval}
              onChange={(e) => setPollInterval(parseInt(e.target.value) || 300)}
              min={60}
              max={3600}
              step={60}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
            />
            <p className="text-xs text-gray-600 mt-1">
              Current: {Math.floor(pollInterval / 60)} minutes
            </p>
          </div>

          {/* Min Score */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Post Score
            </label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value) || -5)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
            />
            <p className="text-xs text-gray-600 mt-1">
              Ignore posts with score below this threshold
            </p>
          </div>

          {/* Knowledge Base */}
          <div className="pt-4 border-t border-gray-200">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Freelancer Profile (Knowledge Base)
            </h2>
            <p className="text-xs text-gray-600 mb-4">
              Used by AI to generate personalized pitches for each opportunity.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bio / Introduction
                </label>
                <textarea
                  value={userBio}
                  onChange={(e) => setUserBio(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
                  placeholder="Fullstack developer with 5+ years building web apps with React and Node.js. I specialize in..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Main Skills
                  <span className="ml-2 font-normal text-gray-500">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={userSkills}
                  onChange={(e) => setUserSkills(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
                  placeholder="React, Node.js, TypeScript, PostgreSQL, AWS"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hourly Rate
                </label>
                <input
                  type="text"
                  value={userHourlyRate}
                  onChange={(e) => setUserHourlyRate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
                  placeholder="$50/hour or R$150/hora"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Portfolio URL
                </label>
                <input
                  type="url"
                  value={userPortfolioUrl}
                  onChange={(e) => setUserPortfolioUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
                  placeholder="https://github.com/username or https://portfolio.com"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-6 py-2 rounded"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>

            <button
              onClick={handleCollectNow}
              disabled={collecting}
              className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-6 py-2 rounded"
            >
              {collecting ? "Collecting..." : "Collect Now"}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">Tips:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Use lowercase keywords (matching is case-insensitive)</li>
            <li>Requires at least 2 positive keywords to match</li>
            <li>Any negative keyword will block the match</li>
            <li>Changes take effect on next polling cycle</li>
            <li>Fill in the Freelancer Profile for AI-generated pitches</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
