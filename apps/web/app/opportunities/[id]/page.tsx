"use client";

import { useEffect, useState, use as usePromise } from "react";
import { api, ApiError } from "@/lib/api";
import type { ContactRecord, OpportunityDetail } from "@/lib/types";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusPill } from "@/components/StatusPill";
import { DraftCard } from "@/components/DraftCard";

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [opp, setOpp] = useState<OpportunityDetail | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [orgName, setOrgName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  async function load() {
    try {
      const [data, contactList] = await Promise.all([
        api.get<OpportunityDetail>(`/api/opportunities/${id}`),
        api.get<ContactRecord[]>(`/api/opportunities/${id}/contacts`),
      ]);
      setOpp(data);
      setContacts(contactList);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load opportunity");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!opp) return <p className="text-sm text-slate-500">{error ?? "Loading..."}</p>;

  const activeDrafts = opp.emailDrafts.slice().sort((a, b) => (a.id < b.id ? 1 : -1));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{opp.event.artistName}</h1>
          <p className="text-sm text-slate-500">
            {opp.event.name} · {opp.event.venueName ?? "Venue TBA"}, {opp.event.venueCity ?? "—"} ·{" "}
            {new Date(opp.event.startsAt).toLocaleString()}
          </p>
          <div className="flex items-center gap-3 mt-1">
            {opp.event.eventUrl && (
              <a className="text-xs text-brand-600 hover:underline" href={opp.event.eventUrl} target="_blank" rel="noreferrer">
                View event listing
              </a>
            )}
            {opp.event.discoverySourceUrl && (
              <a
                className="text-xs text-slate-400 hover:underline"
                href={opp.event.discoverySourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Discovery source ↗
              </a>
            )}
            {opp.event.confidence !== null && opp.event.confidence !== undefined && (
              <span className="text-xs text-slate-400">
                {opp.event.source.replace(/_/g, " ")} · {opp.event.confidence}% confidence
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={opp.status} />
          <ScoreBadge score={opp.score} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-700">Score explanation</h2>
            <button className="text-xs text-brand-600 hover:underline" onClick={() => run(() => api.post(`/api/opportunities/${id}/score`))} disabled={busy}>
              Recompute
            </button>
          </div>
          <ul className="space-y-1 text-sm">
            {(opp.scoreReasons ?? []).map((reason, i) => (
              <li key={i} className={reason.points >= 0 ? "text-emerald-700" : "text-red-600"}>
                {reason.points >= 0 ? "+" : ""}
                {reason.points} — {reason.explanation}
              </li>
            ))}
            {(opp.scoreReasons ?? []).length === 0 && <li className="text-slate-500">No scoring reasons recorded yet.</li>}
          </ul>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-700">Contact</h2>
            <button
              className="text-xs text-brand-600 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => run(() => api.post(`/api/opportunities/${id}/research`))}
            >
              Find contacts
            </button>
          </div>
          {opp.primaryContact ? (
            <div className="text-sm space-y-1">
              <div className="font-medium">{opp.primaryContact.name ?? "(name unknown)"}</div>
              <div className="text-slate-600">{opp.primaryContact.role}</div>
              <div className="text-slate-600">{opp.primaryContact.email}</div>
              <div className="text-xs text-slate-400">Source: {opp.primaryContact.source}</div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mb-2">No contact attached yet. Add one you've verified:</p>
          )}

          {contacts.filter((c) => c.id !== opp.primaryContact?.id).length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-medium text-slate-500">Other candidates</div>
              {contacts
                .filter((c) => c.id !== opp.primaryContact?.id)
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm">
                    <div>
                      <div>{c.name ?? c.email}</div>
                      <div className="text-xs text-slate-400">
                        {c.email} · source: {c.source}
                      </div>
                    </div>
                    <button
                      className="btn-secondary text-xs shrink-0"
                      disabled={busy}
                      onClick={() => run(() => api.post(`/api/opportunities/${id}/contacts/${c.id}/select`))}
                    >
                      Use this contact
                    </button>
                  </div>
                ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-3">
            <input className="input" placeholder="Name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            <input className="input" placeholder="Role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
            <input className="input col-span-2" placeholder="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            <input className="input" placeholder="Organization" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <input className="input" placeholder="Source URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </div>
          <button
            className="btn-secondary mt-2"
            disabled={busy || !contactEmail}
            onClick={() =>
              run(async () => {
                await api.post(`/api/opportunities/${id}/contacts`, {
                  name: contactName || undefined,
                  role: contactRole || undefined,
                  email: contactEmail,
                  organizationName: orgName || undefined,
                  sourceUrl: sourceUrl || undefined,
                });
                setContactName("");
                setContactEmail("");
                setContactRole("");
                setOrgName("");
                setSourceUrl("");
              })
            }
          >
            {opp.primaryContact ? "Add another contact" : "Add contact"}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Outreach email</h2>
          <button
            className="btn-secondary"
            disabled={busy || !opp.primaryContact}
            onClick={() => run(() => api.post(`/api/opportunities/${id}/drafts`, { force: activeDrafts.length > 0 }))}
          >
            {activeDrafts.length > 0 ? "Regenerate" : "Generate draft"}
          </button>
        </div>
        {!opp.primaryContact && <p className="text-sm text-slate-500 mb-2">Add a contact above before generating a draft.</p>}
        <div className="space-y-4">
          {activeDrafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} onChanged={load} />
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Activity timeline</h2>
        <ol className="space-y-3">
          {opp.activityLogs.map((log) => (
            <li key={log.id} className="text-sm border-l-2 border-slate-200 pl-3">
              <div className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</div>
              <div className="text-slate-700">{log.message}</div>
            </li>
          ))}
          {opp.activityLogs.length === 0 && <li className="text-sm text-slate-500">No activity yet.</li>}
        </ol>
      </div>
    </div>
  );
}
