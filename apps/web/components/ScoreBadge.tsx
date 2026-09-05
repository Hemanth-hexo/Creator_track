function labelFor(score: number) {
  if (score >= 90) return { text: "Excellent", cls: "bg-emerald-100 text-emerald-700" };
  if (score >= 70) return { text: "Strong", cls: "bg-blue-100 text-blue-700" };
  if (score >= 50) return { text: "Possible", cls: "bg-amber-100 text-amber-700" };
  return { text: "Low priority", cls: "bg-slate-100 text-slate-600" };
}

export function ScoreBadge({ score }: { score: number }) {
  const { text, cls } = labelFor(score);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {score} · {text}
    </span>
  );
}
