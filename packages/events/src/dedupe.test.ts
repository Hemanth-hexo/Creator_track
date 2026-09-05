import { describe, it, expect } from "vitest";
import { findFuzzyDuplicate } from "./dedupe.js";
import type { DedupeCandidate } from "./dedupe.js";

function candidate(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
  return {
    id: "existing-1",
    artistName: "Bicep",
    venueName: "Brooklyn Mirage",
    venueCity: "Brooklyn",
    startsAt: new Date("2026-11-01T20:00:00Z"),
    ...overrides,
  };
}

describe("findFuzzyDuplicate", () => {
  it("matches same artist, same day, same city", () => {
    const result = findFuzzyDuplicate(
      { artistName: "bicep", venueCity: "brooklyn", startsAt: new Date("2026-11-01T22:00:00Z") },
      [candidate()],
    );
    expect(result).toBe("existing-1");
  });

  it("matches same artist, same day, same venue name (different city casing)", () => {
    const result = findFuzzyDuplicate(
      { artistName: "Bicep", venueName: "brooklyn mirage", startsAt: new Date("2026-11-02T00:00:00Z") },
      [candidate()],
    );
    expect(result).toBe("existing-1");
  });

  it("does not match a different artist", () => {
    const result = findFuzzyDuplicate(
      { artistName: "Overmono", venueCity: "Brooklyn", startsAt: new Date("2026-11-01T20:00:00Z") },
      [candidate()],
    );
    expect(result).toBeNull();
  });

  it("does not match when the date is more than a day apart", () => {
    const result = findFuzzyDuplicate(
      { artistName: "Bicep", venueCity: "Brooklyn", startsAt: new Date("2026-11-05T20:00:00Z") },
      [candidate()],
    );
    expect(result).toBeNull();
  });

  it("does not match when neither city nor venue agree", () => {
    const result = findFuzzyDuplicate(
      { artistName: "Bicep", venueCity: "Los Angeles", venueName: "Some Other Venue", startsAt: new Date("2026-11-01T20:00:00Z") },
      [candidate()],
    );
    expect(result).toBeNull();
  });

  it("matches same artist and day when neither side has any location info", () => {
    const result = findFuzzyDuplicate(
      { artistName: "Bicep", startsAt: new Date("2026-11-01T21:00:00Z") },
      [candidate({ venueName: null, venueCity: null })],
    );
    expect(result).toBe("existing-1");
  });
});
