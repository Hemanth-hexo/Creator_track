import { prisma } from "@photography-outreach/database";
import { createLogger, withLogging } from "@photography-outreach/shared";
import { findFuzzyDuplicate } from "./dedupe.js";
import type { EventProvider, NormalizedEvent } from "./types.js";

const logger = createLogger("events:discovery");

export interface DiscoveryStats {
  provider: string;
  targetsProcessed: number;
  eventsSeen: number;
  eventsCreated: number;
  eventsUpdated: number;
  duplicatesSkipped: number;
  errors: Array<{ target: string; message: string }>;
}

/** Fields that count as a meaningful change worth logging/bumping last_updated_at for. */
function hasChanged(existing: {
  name: string;
  venueName: string | null;
  startsAt: Date;
  eventUrl: string | null;
  confidence: number | null;
}, incoming: NormalizedEvent): boolean {
  return (
    existing.name !== incoming.name ||
    existing.venueName !== (incoming.venueName ?? null) ||
    existing.startsAt.getTime() !== incoming.startsAt.getTime() ||
    existing.eventUrl !== (incoming.eventUrl ?? null) ||
    (incoming.confidence !== undefined && (existing.confidence ?? 0) < incoming.confidence)
  );
}

/**
 * Upserts one normalized event. Dedup happens in two layers:
 *  1. Exact match on (source, sourceId) — the DB unique constraint — handles
 *     re-running the same query/provider (idempotency).
 *  2. A fuzzy match (same artist, same day, matching venue/city) across ANY
 *     source — necessary because web-search-discovered events have no
 *     natural stable ID, so two different search queries can independently
 *     surface the same real event. On a fuzzy match we never create a
 *     second row; we only raise the existing row's confidence/details if
 *     the new discovery is more trustworthy, and log the match instead.
 */
export async function upsertEvent(incoming: NormalizedEvent): Promise<{ id: string; created: boolean; duplicate?: boolean }> {
  const existing = await prisma.event.findUnique({
    where: { source_sourceId: { source: incoming.source, sourceId: incoming.sourceId } },
  });

  if (existing) {
    if (hasChanged(existing, incoming)) {
      await prisma.event.update({
        where: { id: existing.id },
        data: {
          name: incoming.name,
          venueName: incoming.venueName,
          venueCity: incoming.venueCity,
          venueRegion: incoming.venueRegion,
          venueCountry: incoming.venueCountry,
          startsAt: incoming.startsAt,
          eventUrl: incoming.eventUrl,
          description: incoming.description,
          confidence: incoming.confidence,
          discoverySourceUrl: incoming.discoverySourceUrl,
          rawPayload: incoming.rawPayload as object,
        },
      });
      await prisma.activityLog.create({
        data: {
          eventId: existing.id,
          type: "event_updated",
          message: `Updated "${incoming.name}" from ${incoming.source}`,
          actor: "job",
        },
      });
    }
    return { id: existing.id, created: false };
  }

  const nearbyCandidates = await prisma.event.findMany({
    where: {
      artistName: { equals: incoming.artistName, mode: "insensitive" },
      startsAt: {
        gte: new Date(incoming.startsAt.getTime() - 2 * 24 * 60 * 60 * 1000),
        lte: new Date(incoming.startsAt.getTime() + 2 * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true, artistName: true, venueName: true, venueCity: true, startsAt: true, confidence: true },
  });

  const duplicateId = findFuzzyDuplicate(incoming, nearbyCandidates);
  if (duplicateId) {
    const existingConfidence = nearbyCandidates.find((c) => c.id === duplicateId)?.confidence ?? 0;
    if (incoming.confidence !== undefined && incoming.confidence > existingConfidence) {
      await prisma.event.update({
        where: { id: duplicateId },
        data: {
          confidence: incoming.confidence,
          discoverySourceUrl: incoming.discoverySourceUrl,
          eventUrl: incoming.eventUrl ?? undefined,
        },
      });
    }
    await prisma.activityLog.create({
      data: {
        eventId: duplicateId,
        type: "event_updated",
        message: `Duplicate discovery of "${incoming.name}" matched to existing event (source: ${incoming.source})`,
        actor: "job",
        metadata: { duplicateSource: incoming.source, duplicateSourceId: incoming.sourceId },
      },
    });
    return { id: duplicateId, created: false, duplicate: true };
  }

  const created = await prisma.event.create({
    data: {
      source: incoming.source,
      sourceId: incoming.sourceId,
      name: incoming.name,
      artistName: incoming.artistName,
      artistUrl: incoming.artistUrl,
      venueName: incoming.venueName,
      venueCity: incoming.venueCity,
      venueRegion: incoming.venueRegion,
      venueCountry: incoming.venueCountry,
      lat: incoming.lat,
      lng: incoming.lng,
      startsAt: incoming.startsAt,
      eventUrl: incoming.eventUrl,
      description: incoming.description,
      confidence: incoming.confidence,
      discoverySourceUrl: incoming.discoverySourceUrl,
      rawPayload: incoming.rawPayload as object,
    },
  });
  await prisma.activityLog.create({
    data: {
      eventId: created.id,
      type: "event_discovered",
      message: `Discovered "${created.name}" via ${incoming.source}`,
      actor: "job",
      metadata: { source: incoming.source, sourceId: incoming.sourceId, confidence: incoming.confidence },
    },
  });
  return { id: created.id, created: true };
}

/**
 * Runs discovery for every active discovery query against the given
 * provider, upserting each result. Safe to re-run repeatedly (idempotent
 * via upsertEvent's two-layer dedup) — e.g. from a daily cron job.
 */
export async function discoverEvents(provider: EventProvider): Promise<DiscoveryStats> {
  return withLogging(logger, { operation: "discoverEvents", provider: provider.name }, async () => {
    const queries = await prisma.discoveryQuery.findMany({ where: { active: true } });
    const stats: DiscoveryStats = {
      provider: provider.name,
      targetsProcessed: 0,
      eventsSeen: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      duplicatesSkipped: 0,
      errors: [],
    };

    for (const discoveryQuery of queries) {
      stats.targetsProcessed += 1;
      try {
        const events = await provider.fetchEvents(discoveryQuery.query);
        stats.eventsSeen += events.length;
        for (const event of events) {
          const result = await upsertEvent(event);
          if (result.created) stats.eventsCreated += 1;
          else if (result.duplicate) stats.duplicatesSkipped += 1;
          else stats.eventsUpdated += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { query: discoveryQuery.query, provider: provider.name, err: message },
          "discoverEvents:target_failed",
        );
        stats.errors.push({ target: discoveryQuery.query, message });
      }
    }

    return stats;
  });
}
