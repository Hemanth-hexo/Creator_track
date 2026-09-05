import { ProviderError, createLogger } from "@photography-outreach/shared";
import type { EventProvider, NormalizedEvent } from "../types.js";

const logger = createLogger("events:bandsintown");

interface BandsintownVenue {
  name?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

interface BandsintownEvent {
  id: string;
  url?: string;
  datetime: string;
  description?: string;
  venue?: BandsintownVenue;
  artist?: { name?: string; url?: string };
  title?: string;
}

/**
 * NOT used by default — kept as a second, working EventProvider
 * implementation to prove the abstraction actually holds. The MVP's default
 * provider is OpenAIWebSearchEventProvider (see openai-web-search.ts); this
 * one requires a BANDSINTOWN_APP_ID and is keyed by artist name (there is no
 * free-tier "search by city/genre" endpoint), so it only fits a
 * watchlist-of-specific-artists use case, not open-ended discovery. Enable
 * it by wiring it into the discovery job in place of/alongside the default
 * provider if you want a second, structured-API source.
 */
export class BandsintownProvider implements EventProvider {
  readonly name = "bandsintown";

  constructor(private readonly appId: string) {
    if (!appId) {
      throw new Error("BandsintownProvider requires a non-empty app_id (BANDSINTOWN_APP_ID)");
    }
  }

  async fetchEvents(artistName: string): Promise<NormalizedEvent[]> {
    const url = new URL(
      `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events`,
    );
    url.searchParams.set("app_id", this.appId);
    url.searchParams.set("date", "upcoming");

    const start = Date.now();
    let response: Response;
    try {
      response = await fetch(url.toString());
    } catch (error) {
      throw new ProviderError("bandsintown", `Network error fetching events for "${artistName}"`, {
        cause: error instanceof Error ? error.message : error,
      });
    }

    if (response.status === 404) {
      // Bandsintown returns 404 for an artist it doesn't recognize — treat as zero events, not an error.
      logger.info({ artist: artistName, durationMs: Date.now() - start, status: "not_found" });
      return [];
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ProviderError(
        "bandsintown",
        `Request failed for "${artistName}": ${response.status} ${response.statusText}`,
        { body },
      );
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new ProviderError("bandsintown", `Unexpected response shape for "${artistName}"`, { payload });
    }

    logger.info({
      artist: artistName,
      count: payload.length,
      durationMs: Date.now() - start,
      status: "ok",
    });

    return (payload as BandsintownEvent[]).map((raw) => this.normalize(raw, artistName));
  }

  private normalize(raw: BandsintownEvent, requestedArtistName: string): NormalizedEvent {
    const venue = raw.venue;
    const lat = venue?.latitude ? Number(venue.latitude) : undefined;
    const lng = venue?.longitude ? Number(venue.longitude) : undefined;

    return {
      source: this.name,
      sourceId: raw.id,
      name: raw.title ?? `${raw.artist?.name ?? requestedArtistName} at ${venue?.name ?? "TBA"}`,
      artistName: raw.artist?.name ?? requestedArtistName,
      artistUrl: raw.artist?.url,
      venueName: venue?.name,
      venueCity: venue?.city,
      venueRegion: venue?.region,
      venueCountry: venue?.country,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      startsAt: new Date(raw.datetime),
      eventUrl: raw.url,
      confidence: 100,
      discoverySourceUrl: raw.url,
      description: raw.description,
      rawPayload: raw,
    };
  }
}
