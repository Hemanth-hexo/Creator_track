/**
 * Common shape every EventProvider must normalize its raw API response into.
 * The rest of the app (scoring, storage, UI) only ever deals with this shape,
 * never a provider's native format — that's what lets a new provider (e.g.
 * Ticketmaster) be added later without touching downstream code.
 */
export interface NormalizedEvent {
  source: string;
  sourceId: string;
  name: string;
  artistName: string;
  artistUrl?: string;
  venueName?: string;
  venueCity?: string;
  venueRegion?: string;
  venueCountry?: string;
  lat?: number;
  lng?: number;
  startsAt: Date;
  eventUrl?: string;
  description?: string;
  /** 0-100: how much to trust this event's details. Structured-API providers should report 100. */
  confidence?: number;
  /** The exact page a discovery process found this event's details on (may differ from eventUrl). */
  discoverySourceUrl?: string;
  rawPayload: unknown;
}

export interface EventProvider {
  readonly name: string;
  /** Fetches upcoming events for one search target (e.g. an artist name). */
  fetchEvents(target: string): Promise<NormalizedEvent[]>;
}
