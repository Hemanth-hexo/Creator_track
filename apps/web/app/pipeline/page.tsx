"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { OpportunityRecord } from "@/lib/types";
import { NEXT_STAGE, PIPELINE_STAGES } from "@/lib/constants";
import { ScoreBadge } from "@/components/ScoreBadge";

export default function PipelinePage() {
  const [items, setItems] = useState<OpportunityRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<{ items: OpportunityRecord[] }>("/api/opportunities?limit=200");
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function advance(id: string, next: string) {
    setBusyId(id);
    try {
      await api.patch(`/api/opportunities/${id}/status`, { status: next });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to advance");
    } finally {
      setBusyId(null);
    }
  }

  const byStage = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, items.filter((o) => o.status === s)]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <p className="text-sm text-slate-500">Click "Advance" to move an opportunity to its next stage</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="w-64 shrink-0">
            <div className="text-xs font-semibold uppercase text-slate-500 mb-2 flex items-center justify-between">
              <span>{stage.replace(/_/g, " ")}</span>
              <span className="text-slate-400">{byStage[stage].length}</span>
            </div>
            <div className="space-y-2">
              {byStage[stage].map((opp) => (
                <div key={opp.id} className="card p-3 space-y-2">
                  <Link href={`/opportunities/${opp.id}`} className="font-medium text-sm text-slate-900 hover:underline block">
                    {opp.event.artistName}
                  </Link>
                  <div className="text-xs text-slate-500">{opp.event.venueCity ?? "—"}</div>
                  <ScoreBadge score={opp.score} />
                  {NEXT_STAGE[stage] && (
                    <button
                      className="btn-secondary w-full text-xs"
                      disabled={busyId === opp.id}
                      onClick={() => advance(opp.id, NEXT_STAGE[stage]!)}
                    >
                      Advance → {NEXT_STAGE[stage]!.replace(/_/g, " ")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
