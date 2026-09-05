"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { EmailDraftRecord } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft (unreviewed)",
  edited: "Edited",
  approved: "Approved — ready to send",
  rejected: "Rejected",
  sent: "Sent",
};

export function DraftCard({ draft, onChanged }: { draft: EmailDraftRecord; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const canEdit = draft.status === "draft" || draft.status === "edited";
  const canApprove = canEdit;
  const canSend = draft.status === "approved";

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{STATUS_LABEL[draft.status]}</span>
        {!draft.contact && draft.status !== "sent" && (
          <span className="text-xs text-amber-600">No recipient contact attached yet — add one above to approve.</span>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <input className="input font-medium" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="input h-40" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      ) : (
        <div>
          <div className="font-medium text-slate-900">{draft.subject}</div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{draft.body}</p>
        </div>
      )}

      {draft.personalizationReasoning && (
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-medium text-slate-700">Why this angle: </span>
          {draft.personalizationReasoning}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {draft.suggestedService && <span>Service: {draft.suggestedService}</span>}
        {draft.cta && <span>· CTA: {draft.cta}</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        {canEdit && !editing && (
          <button className="btn-secondary" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </button>
        )}
        {editing && (
          <>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.patch(`/api/drafts/${draft.id}`, { subject, body });
                  setEditing(false);
                })
              }
            >
              Save edit
            </button>
            <button className="btn-secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </>
        )}
        {canApprove && !editing && (
          <button
            className="btn-primary"
            disabled={busy || !draft.contact}
            onClick={() => run(() => api.post(`/api/drafts/${draft.id}/approve`))}
          >
            Approve
          </button>
        )}
        {canEdit && !editing && (
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => run(() => api.post(`/api/drafts/${draft.id}/reject`))}
          >
            Reject
          </button>
        )}
        {canSend && (
          <button className="btn-primary" disabled={busy} onClick={() => run(() => api.post(`/api/drafts/${draft.id}/send`))}>
            Send now
          </button>
        )}
      </div>
    </div>
  );
}
