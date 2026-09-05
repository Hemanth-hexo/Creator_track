const COLORS: Record<string, string> = {
  discovered: "bg-slate-100 text-slate-600",
  qualified: "bg-sky-100 text-sky-700",
  researching: "bg-sky-100 text-sky-700",
  contact_found: "bg-indigo-100 text-indigo-700",
  drafted: "bg-violet-100 text-violet-700",
  approved: "bg-teal-100 text-teal-700",
  sent: "bg-emerald-100 text-emerald-700",
  follow_up: "bg-amber-100 text-amber-700",
  replied: "bg-cyan-100 text-cyan-700",
  booked: "bg-green-100 text-green-800",
  completed: "bg-green-200 text-green-900",
  rejected: "bg-red-100 text-red-700",
  dead: "bg-slate-200 text-slate-500",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${COLORS[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
