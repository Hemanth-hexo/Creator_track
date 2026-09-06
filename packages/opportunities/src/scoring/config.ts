import type { ScoringRule } from "./types.js";

/**
 * The scoring rulebook. Each rule is independent and returns its own signed
 * point delta + a human-readable explanation, which is exactly what gets
 * stored in opportunities.score_reasons and shown in the frontend. Tune
 * weights here without touching the engine in engine.ts.
 */
export const scoringRules: ScoringRule[] = [
  {
    id: "target_city_match",
    description: "Event is in one of your target cities",
    evaluate(ctx) {
      if (!ctx.event.venueCity) return null;
      const match = ctx.targetCities.some(
        (city) => city.toLowerCase() === ctx.event.venueCity!.toLowerCase(),
      );
      return match
        ? { points: 20, explanation: `Event is in target city (${ctx.event.venueCity})` }
        : null;
    },
  },
  {
    id: "genre_match",
    description: "Artist genre overlaps with your target genres",
    evaluate(ctx) {
      const overlap = ctx.artistGenres.filter((g) =>
        ctx.targetGenres.some((t) => t.toLowerCase() === g.toLowerCase()),
      );
      if (overlap.length === 0) return null;
      return {
        points: 15,
        explanation: `Genre match: ${overlap.join(", ")}`,
      };
    },
  },
  {
    id: "lead_time",
    description: "Event is far enough out to realistically pitch and prep",
    evaluate(ctx) {
      const daysOut = (ctx.event.startsAt.getTime() - ctx.now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysOut < 0) return { points: -30, explanation: "Event date has already passed" };
      if (daysOut < 3) return { points: -15, explanation: "Event is less than 3 days away — too little lead time" };
      if (daysOut <= 45) return { points: 15, explanation: `Good lead time (${Math.round(daysOut)} days out)` };
      return { points: 5, explanation: `Far out (${Math.round(daysOut)} days) — still workable` };
    },
  },
  {
    id: "contact_available",
    description: "A verified contact is already attached to this opportunity",
    evaluate(ctx) {
      return ctx.hasKnownContact
        ? { points: 20, explanation: "Contact information found" }
        : { points: -10, explanation: "No contact information yet" };
    },
  },
  {
    id: "recent_outreach_penalty",
    description: "Avoid re-pitching the same artist/venue too often",
    evaluate(ctx) {
      if (ctx.recentOutreachToSameArtistOrVenue === 0) return null;
      return {
        points: -15,
        explanation: `Already contacted this artist/venue ${ctx.recentOutreachToSameArtistOrVenue} time(s) recently`,
      };
    },
  },
  {
    id: "similar_event_conversion_history",
    description: "A similar past opportunity actually converted into booked work",
    evaluate(ctx) {
      const { sameVenueBookedCount, sameArtistBookedCount, sameCityBookedCount } = ctx.similarEventConversionHistory;
      // Strongest precedent only, not summed — a venue that already booked
      // you is also "in the same city," but that's one fact, not two.
      if (sameVenueBookedCount > 0) {
        return { points: 15, explanation: `Booked work at this exact venue before (${sameVenueBookedCount}x)` };
      }
      if (sameArtistBookedCount > 0) {
        return { points: 12, explanation: `Booked work with this artist before (${sameArtistBookedCount}x)` };
      }
      if (sameCityBookedCount > 0) {
        return { points: 8, explanation: `Booked work in this city before (${sameCityBookedCount}x)` };
      }
      return null;
    },
  },
];
