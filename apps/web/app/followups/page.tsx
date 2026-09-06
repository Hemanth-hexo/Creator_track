"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { FollowupRecord } from "@/lib/types";

function FollowupCard({ followup, onApprove, onCancel, busy }: {
  followup: FollowupRecord;
  onApprove?: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { event, primaryContact } = followup.opportunity;
  return (
    <div className="card p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Link href={`/opportunities/${followup.opportunity.id}`} className="font-medium text-slate-900 hover:underline">
          {event.artistName}
        </Link>
        <div className="text-sm text-slate-500">
          {event.venueName ?? "Venue TBA"}, {event.venueCity ?? "—"}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Scheduled for {new Date(followup.scheduledFor).toLocaleDateString()}
          {primaryContact && ` · ${primaryContact.email}`}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onApprove && (
          <button className="btn-primary text-xs" disabled={busy} onClick={onApprove}>
            Approve
          </button>
        )}
        <button className="btn-secondary text-xs" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FollowupsPage() {
  const [due, setDue] = useState<FollowupRecord[]>([]);
  const [approved, setApproved] = useState<FollowupRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const [dueRes, approvedRes] = await Promise.all([
        api.get<FollowupRecord[]>("/api/followups/due"),
        api.get<FollowupRecord[]>("/api/followups/approved"),
      ]);
      setDue(dueRes);
      setApproved(approvedRes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load follow-ups");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Follow-ups</h1>
        <p className="text-sm text-slate-500">
          Approve a due follow-up, then generate, review, and send its draft from the opportunity page — sending it
          automatically marks the follow-up done.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Due ({due.length})</h2>
        {due.length === 0 && <p className="text-sm text-slate-500">Nothing due right now.</p>}
        {due.map((f) => (
          <FollowupCard
            key={f.id}
            followup={f}
            busy={busyId === f.id}
            onApprove={() => run(f.id, () => api.post(`/api/followups/${f.id}/approve`))}
            onCancel={() => run(f.id, () => api.post(`/api/followups/${f.id}/cancel`))}
          />
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Approved — ready to draft ({approved.length})</h2>
        {approved.length === 0 && <p className="text-sm text-slate-500">Nothing approved and waiting.</p>}
        {approved.map((f) => (
          <FollowupCard
            key={f.id}
            followup={f}
            busy={busyId === f.id}
            onCancel={() => run(f.id, () => api.post(`/api/followups/${f.id}/cancel`))}
          />
        ))}
      </div>
    </div>
  );
}
