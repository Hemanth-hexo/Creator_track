"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { DiscoveryQuery, PhotographerProfile } from "@/lib/types";

function ListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(values.join("\n"));
  useEffect(() => setText(values.join("\n")), [values]);
  return (
    <div>
      <label className="label">{label} (one per line)</label>
      <textarea
        className="input h-24"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean));
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<PhotographerProfile | null>(null);
  const [queries, setQueries] = useState<DiscoveryQuery[]>([]);
  const [newQuery, setNewQuery] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [p, q] = await Promise.all([
        api.get<PhotographerProfile>("/api/settings/profile"),
        api.get<DiscoveryQuery[]>("/api/settings/discovery-queries"),
      ]);
      setProfile(p);
      setQueries(q);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load settings");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile() {
    if (!profile) return;
    setError(null);
    try {
      await api.put("/api/settings/profile", profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save");
    }
  }

  async function addQuery() {
    if (!newQuery.trim()) return;
    await api.post("/api/settings/discovery-queries", {
      query: newQuery.trim(),
      location: newLocation.trim() || undefined,
    });
    setNewQuery("");
    setNewLocation("");
    load();
  }

  async function toggleQuery(id: string, active: boolean) {
    await api.patch(`/api/settings/discovery-queries/${id}`, { active });
    load();
  }

  if (!profile) return <p className="text-sm text-slate-500">{error ?? "Loading..."}</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-500">This context is injected into every generated outreach email — keep it honest.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Photographer profile</h2>
        <div>
          <label className="label">Display name</label>
          <input className="input" value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
        </div>
        <div>
          <label className="label">Portfolio URL</label>
          <input
            className="input"
            value={profile.portfolioUrl ?? ""}
            onChange={(e) => setProfile({ ...profile, portfolioUrl: e.target.value })}
          />
        </div>
        <ListEditor label="Services offered" values={profile.services} onChange={(v) => setProfile({ ...profile, services: v })} />
        <ListEditor
          label="Experience (only true, verifiable facts)"
          values={profile.experienceBullets}
          onChange={(v) => setProfile({ ...profile, experienceBullets: v })}
        />
        <ListEditor label="Style keywords" values={profile.styleKeywords} onChange={(v) => setProfile({ ...profile, styleKeywords: v })} />
        <ListEditor label="Target cities" values={profile.targetCities} onChange={(v) => setProfile({ ...profile, targetCities: v })} />
        <ListEditor label="Target genres" values={profile.targetGenres} onChange={(v) => setProfile({ ...profile, targetGenres: v })} />
        <button className="btn-primary" onClick={saveProfile}>
          {saved ? "Saved!" : "Save profile"}
        </button>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Discovery queries (web search)</h2>
        <p className="text-xs text-slate-500">
          Each active query is run through web search on a schedule to find real, verifiable upcoming
          events — e.g. &quot;upcoming electronic music events in Bengaluru, India&quot;. Be specific about location and
          genre for better results.
        </p>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder='Query, e.g. "upcoming live music events in Bengaluru"'
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
          />
          <input
            className="input w-48"
            placeholder="Location (optional)"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
          <button className="btn-secondary" onClick={addQuery}>
            Add
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {queries.map((q) => (
            <li key={q.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div>{q.query}</div>
                {q.location && <div className="text-xs text-slate-400">{q.location}</div>}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                <input type="checkbox" checked={q.active} onChange={(e) => toggleQuery(q.id, e.target.checked)} />
                Active
              </label>
            </li>
          ))}
          {queries.length === 0 && <li className="py-2 text-sm text-slate-500">No discovery queries yet.</li>}
        </ul>
      </div>
    </div>
  );
}
