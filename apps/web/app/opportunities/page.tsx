"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { OpportunityRecord } from "@/lib/types";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusPill } from "@/components/StatusPill";
import { OPPORTUNITY_STATUSES } from "@/lib/constants";

export default function OpportunitiesPage() {
  const [items, setItems] = useState<OpportunityRecord[]>([]);
  const [status, setStatus] = useState("");
  const [minScore, setMinScore] = useState("");
  const [city, setCity] = useState("");
  const [artistName, setArtistName] = useState("");
  const [hasContact, setHasContact] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (minScore) params.set("minScore", minScore);
    if (city) params.set("city", city);
    if (artistName) params.set("artistName", artistName);
    if (hasContact) params.set("hasContact", hasContact);
    try {
      const res = await api.get<{ items: OpportunityRecord[] }>(`/api/opportunities?${params.toString()}`);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Opportunities</h1>
        <p className="text-sm text-slate-500">Every discovered event, scored and filterable</p>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            {OPPORTUNITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Min score</label>
          <input className="input w-24" type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </div>
        <div>
          <label className="label">City</label>
          <input className="input w-40" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label className="label">Artist</label>
          <input className="input w-40" value={artistName} onChange={(e) => setArtistName(e.target.value)} />
        </div>
        <div>
          <label className="label">Contact</label>
          <select className="input" value={hasContact} onChange={(e) => setHasContact(e.target.value)}>
            <option value="">Any</option>
            <option value="true">Has contact</option>
            <option value="false">No contact</option>
          </select>
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Apply filters"}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2">Artist</th>
              <th className="px-4 py-2">Venue</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((opp) => (
              <tr key={opp.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => (window.location.href = `/opportunities/${opp.id}`)}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/opportunities/${opp.id}`}>{opp.event.artistName}</Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{opp.event.venueName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{opp.event.venueCity ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(opp.event.startsAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <ScoreBadge score={opp.score} />
                </td>
                <td className="px-4 py-3 text-slate-600">{opp.primaryContact?.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusPill status={opp.status} />
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No opportunities match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
