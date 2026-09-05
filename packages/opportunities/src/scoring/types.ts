/**
 * Everything a scoring rule might need. Kept as plain data (no Prisma types)
 * so the engine can be unit tested with fixtures instead of a database.
 */
export interface ScoringContext {
  event: {
    startsAt: Date;
    venueCity: string | null;
    venueCountry: string | null;
    description: string | null;
  };
  artistGenres: string[];
  targetCities: string[];
  targetGenres: string[];
  hasKnownContact: boolean;
  recentOutreachToSameArtistOrVenue: number;
  previousConvertedSimilarEvents: number;
  now: Date;
}

export interface ScoreReason {
  rule: string;
  points: number;
  explanation: string;
}

export interface ScoreResult {
  score: number;
  reasons: ScoreReason[];
}

export interface ScoringRule {
  id: string;
  description: string;
  /** Returns signed points to add (positive or negative), or 0 if the rule doesn't apply. */
  evaluate(ctx: ScoringContext): { points: number; explanation: string } | null;
}
