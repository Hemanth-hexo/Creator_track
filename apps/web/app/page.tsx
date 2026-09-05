"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { OpportunityRecord, Statistics } from "@/lib/types";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusPill } from "@/components/StatusPill";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [highPriority, setHighPriority] = useState<OpportunityRecord[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [statsRes, oppsRes] = await Promise.all([
        api.get<Statistics>("/api/stats"),
        api.get<{ items: OpportunityRecord[] }>("/api/opportunities?minScore=70&limit=10"),
      ]);
      setStats(statsRes);
      setHighPriority(oppsRes.items);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runDiscovery() {
    setDiscovering(true);
    setError(null);
    try {
      // Discovery runs in the background on the server (it's several real
      // search+LLM calls and can take a minute or more), so this just starts
      // the job and polls its status instead of waiting on one long request.
      const { jobId } = await api.post<{ jobId: string }>("/api/events/discover");
      const maxAttempts = 40; // ~2 minutes at 3s intervals
      let finished = false;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await sleep(3000);
        const job = await api.get<{ status: string; error: string | null }>(`/api/jobs/${jobId}`);
        if (job.status === "success") {
          finished = true;
          break;
        }
        if (job.status === "failed") throw new Error(job.error ?? "Discovery job failed");
      }
      if (!finished) {
        setError("Discovery is taking longer than expected — it's still running in the background, check back shortly.");
      }
      await load();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else if (e instanceof Error) setError(e.message);
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">Your outreach pipeline at a glance</p>
        </div>
        <button className="btn-primary" onClick={runDiscovery} disabled={discovering}>
          {discovering ? "Discovering..." : "Run event discovery"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Awaiting approval" value={stats.awaitingApprovalCount} />
          <StatCard label="Drafts" value={stats.draftedCount} />
          <StatCard label="Sent this week" value={stats.sentThisWeek} />
          <StatCard label="Follow-ups due" value={stats.followupsDue} />
        </div>
      )}

      {stats && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Pipeline funnel</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <StatusPill status={status} />
                <span className="text-sm text-slate-600">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">High-priority opportunities (score 70+)</h2>
          <Link href="/opportunities" className="text-sm text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {highPriority.length === 0 && <p className="p-4 text-sm text-slate-500">No high-priority opportunities yet.</p>}
          {highPriority.map((opp) => (
            <Link
              key={opp.id}
              href={`/opportunities/${opp.id}`}
              className="flex items-center justify-between p-4 hover:bg-slate-50"
            >
              <div>
                <div className="font-medium text-slate-900">{opp.event.artistName}</div>
                <div className="text-xs text-slate-500">
                  {opp.event.venueName ?? "Venue TBA"} · {opp.event.venueCity ?? "—"} ·{" "}
                  {new Date(opp.event.startsAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={opp.status} />
                <ScoreBadge score={opp.score} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
