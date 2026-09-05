export interface DedupeCandidate {
  id: string;
  artistName: string;
  venueName: string | null;
  venueCity: string | null;
  startsAt: Date;
}

export interface DedupeInput {
  artistName: string;
  venueName?: string;
  venueCity?: string;
  startsAt: Date;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fuzzy-matches a newly discovered event against existing rows that don't
 * share its (source, sourceId) — the exact-match path handles re-runs of
 * the same query, but two different search queries (or a future second
 * provider) can independently surface the same real-world event with no
 * shared identifier. This catches that case: same artist, within a day of
 * the same date, and either the venue or city agrees (or neither event
 * carries location info at all, in which case artist+date alone matches).
 * Pure function — no DB access — so it's unit-testable without a database.
 */
export function findFuzzyDuplicate(incoming: DedupeInput, candidates: DedupeCandidate[]): string | null {
  const incomingArtist = incoming.artistName.trim().toLowerCase();
  const incomingCity = (incoming.venueCity ?? "").trim().toLowerCase();
  const incomingVenue = (incoming.venueName ?? "").trim().toLowerCase();

  for (const candidate of candidates) {
    if (candidate.artistName.trim().toLowerCase() !== incomingArtist) continue;

    const dateDelta = Math.abs(candidate.startsAt.getTime() - incoming.startsAt.getTime());
    if (dateDelta > ONE_DAY_MS) continue;

    const candidateCity = (candidate.venueCity ?? "").trim().toLowerCase();
    const candidateVenue = (candidate.venueName ?? "").trim().toLowerCase();

    if (incomingCity && candidateCity && incomingCity === candidateCity) return candidate.id;
    if (incomingVenue && candidateVenue && incomingVenue === candidateVenue) return candidate.id;
    if (!incomingCity && !incomingVenue && !candidateCity && !candidateVenue) return candidate.id;
  }

  return null;
}
