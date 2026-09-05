import { scoringRules } from "./config.js";
import type { ScoreResult, ScoringContext } from "./types.js";

/** Runs every configured rule against the context and produces a 0-100 score plus its reasons. */
export function scoreOpportunity(ctx: ScoringContext): ScoreResult {
  const reasons = scoringRules
    .map((rule) => {
      const result = rule.evaluate(ctx);
      if (!result) return null;
      return { rule: rule.id, points: result.points, explanation: result.explanation };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const raw = reasons.reduce((sum, r) => sum + r.points, 0);
  // Base of 50 so a "neutral" event with no strong signals lands mid-scale rather than at 0.
  const score = Math.max(0, Math.min(100, 50 + raw));

  return { score, reasons };
}

export function scoreLabel(score: number): "excellent" | "strong" | "possible" | "low_priority" {
  if (score >= 90) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 50) return "possible";
  return "low_priority";
}

export * from "./types.js";
export { scoringRules } from "./config.js";
