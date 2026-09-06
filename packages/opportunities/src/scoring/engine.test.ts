import { describe, it, expect } from "vitest";
import { scoreOpportunity, scoreLabel } from "./engine.js";
import type { ScoringContext } from "./types.js";

function baseCtx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  const now = new Date("2026-09-05T00:00:00Z");
  return {
    event: {
      startsAt: new Date("2026-10-01T00:00:00Z"),
      venueCity: "Brooklyn",
      venueCountry: "United States",
      description: null,
    },
    artistGenres: ["electronic"],
    targetCities: ["Brooklyn", "New York"],
    targetGenres: ["electronic", "house"],
    hasKnownContact: false,
    recentOutreachToSameArtistOrVenue: 0,
    similarEventConversionHistory: { sameVenueBookedCount: 0, sameArtistBookedCount: 0, sameCityBookedCount: 0 },
    now,
    ...overrides,
  };
}

describe("scoreOpportunity", () => {
  it("scores a strong match highly and explains why", () => {
    const result = scoreOpportunity(baseCtx({ hasKnownContact: true }));
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons.map((r) => r.rule)).toEqual(
      expect.arrayContaining(["target_city_match", "genre_match", "lead_time", "contact_available"]),
    );
  });

  it("penalizes events with no city/genre match and no contact", () => {
    const result = scoreOpportunity(
      baseCtx({ event: { ...baseCtx().event, venueCity: "Nowhere" }, artistGenres: ["polka"] }),
    );
    expect(result.score).toBeLessThan(70);
  });

  it("heavily penalizes events that already happened", () => {
    const result = scoreOpportunity(
      baseCtx({ event: { ...baseCtx().event, startsAt: new Date("2026-01-01T00:00:00Z") } }),
    );
    const leadTimeReason = result.reasons.find((r) => r.rule === "lead_time");
    expect(leadTimeReason?.points).toBeLessThan(0);
  });

  it("clamps score between 0 and 100", () => {
    const veryBad = scoreOpportunity(
      baseCtx({
        event: { ...baseCtx().event, startsAt: new Date("2020-01-01T00:00:00Z"), venueCity: "Nowhere" },
        artistGenres: [],
        recentOutreachToSameArtistOrVenue: 5,
      }),
    );
    expect(veryBad.score).toBeGreaterThanOrEqual(0);
    expect(veryBad.score).toBeLessThanOrEqual(100);
  });

  it("never produces a fabricated reason for zero-value factors", () => {
    const result = scoreOpportunity(baseCtx());
    const conversionReason = result.reasons.find((r) => r.rule === "similar_event_conversion_history");
    expect(conversionReason).toBeUndefined();
  });

  describe("similar_event_conversion_history", () => {
    it("prefers the same-venue precedent over artist or city when more than one applies", () => {
      const result = scoreOpportunity(
        baseCtx({
          similarEventConversionHistory: { sameVenueBookedCount: 1, sameArtistBookedCount: 1, sameCityBookedCount: 1 },
        }),
      );
      const reason = result.reasons.find((r) => r.rule === "similar_event_conversion_history");
      expect(reason).toMatchObject({ points: 15 });
      expect(reason?.explanation).toMatch(/exact venue/);
    });

    it("falls back to the artist precedent when no venue precedent exists", () => {
      const result = scoreOpportunity(
        baseCtx({
          similarEventConversionHistory: { sameVenueBookedCount: 0, sameArtistBookedCount: 1, sameCityBookedCount: 1 },
        }),
      );
      const reason = result.reasons.find((r) => r.rule === "similar_event_conversion_history");
      expect(reason).toMatchObject({ points: 12 });
      expect(reason?.explanation).toMatch(/this artist/);
    });

    it("falls back to the weaker city-only precedent when that's all there is", () => {
      const result = scoreOpportunity(
        baseCtx({
          similarEventConversionHistory: { sameVenueBookedCount: 0, sameArtistBookedCount: 0, sameCityBookedCount: 2 },
        }),
      );
      const reason = result.reasons.find((r) => r.rule === "similar_event_conversion_history");
      expect(reason).toMatchObject({ points: 8 });
      expect(reason?.explanation).toMatch(/this city/);
    });
  });
});

describe("scoreLabel", () => {
  it.each([
    [95, "excellent"],
    [80, "strong"],
    [60, "possible"],
    [30, "low_priority"],
  ] as const)("maps %i to %s", (score, label) => {
    expect(scoreLabel(score)).toBe(label);
  });
});
