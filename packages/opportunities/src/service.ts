import { prisma } from "@photography-outreach/database";
import type { Prisma } from "@photography-outreach/database";
import {
  ActivityActor,
  InvalidStateTransitionError,
  NotFoundError,
  OpportunityStatus,
  canTransitionOpportunity,
  createLogger,
  withLogging,
} from "@photography-outreach/shared";
import { scoreOpportunity } from "./scoring/engine.js";
import type { ScoringContext } from "./scoring/types.js";

const logger = createLogger("opportunities:service");

/** Creates an Opportunity for an Event if one doesn't already exist. Idempotent via the unique(event_id) constraint. */
export async function ensureOpportunityForEvent(eventId: string): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.opportunity.findUnique({ where: { eventId } });
  if (existing) return { id: existing.id, created: false };

  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { venue: true } });
  if (!event) throw new NotFoundError("Event", eventId);

  const created = await prisma.opportunity.create({
    data: { eventId, venueId: event.venueId ?? undefined, status: "discovered" },
  });
  await prisma.activityLog.create({
    data: {
      opportunityId: created.id,
      eventId,
      type: "opportunity_created",
      message: `Opportunity created for "${event.name}"`,
      actor: "job",
    },
  });
  return { id: created.id, created: true };
}

async function buildScoringContext(opportunityId: string): Promise<ScoringContext> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { event: { include: { artist: true } }, primaryContact: true },
  });
  if (!opportunity) throw new NotFoundError("Opportunity", opportunityId);

  const [profile, recentOutreach, convertedSimilar] = await Promise.all([
    prisma.creativeProfile.findUnique({ where: { id: "default" } }),
    prisma.outreach.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        opportunity: { event: { artistName: opportunity.event.artistName } },
      },
    }),
    prisma.opportunity.count({
      where: {
        status: "booked",
        event: { venueCity: opportunity.event.venueCity ?? undefined },
      },
    }),
  ]);

  return {
    event: {
      startsAt: opportunity.event.startsAt,
      venueCity: opportunity.event.venueCity,
      venueCountry: opportunity.event.venueCountry,
      description: opportunity.event.description,
    },
    artistGenres: opportunity.event.artist?.genres ?? [],
    targetCities: profile?.targetCities ?? [],
    targetGenres: profile?.targetGenres ?? [],
    hasKnownContact: Boolean(opportunity.primaryContactId),
    recentOutreachToSameArtistOrVenue: recentOutreach,
    previousConvertedSimilarEvents: convertedSimilar,
    now: new Date(),
  };
}

/** Recomputes and persists the score for an opportunity. Safe to call repeatedly (idempotent recompute). */
export async function runScoring(opportunityId: string, actor: ActivityActor = "job") {
  return withLogging(logger, { operation: "runScoring", opportunityId }, async () => {
    const ctx = await buildScoringContext(opportunityId);
    const result = scoreOpportunity(ctx);

    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { score: result.score, scoreReasons: result.reasons as unknown as Prisma.InputJsonValue },
    });
    await prisma.activityLog.create({
      data: {
        opportunityId,
        type: "opportunity_scored",
        message: `Opportunity scored ${result.score}`,
        actor,
        metadata: { score: result.score, reasons: result.reasons } as unknown as Prisma.InputJsonValue,
      },
    });

    return result;
  });
}

/** Finds events without an opportunity yet, creates + scores one for each. This is what the daily job runs. */
export async function processDiscoveredEvents(): Promise<{ processed: number }> {
  const events = await prisma.event.findMany({
    where: { opportunity: null },
    select: { id: true },
  });

  for (const event of events) {
    const { id } = await ensureOpportunityForEvent(event.id);
    await runScoring(id, "job");
  }

  return { processed: events.length };
}

export async function transitionOpportunityStatus(
  opportunityId: string,
  to: OpportunityStatus,
  actor: ActivityActor,
): Promise<void> {
  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw new NotFoundError("Opportunity", opportunityId);
  if (opportunity.status === to) return; // already there — idempotent no-op

  if (!canTransitionOpportunity(opportunity.status, to)) {
    throw new InvalidStateTransitionError("Opportunity", opportunity.status, to);
  }

  await prisma.opportunity.update({ where: { id: opportunityId }, data: { status: to } });
  await prisma.activityLog.create({
    data: {
      opportunityId,
      type: "opportunity_status_changed",
      message: `Status changed from ${opportunity.status} to ${to}`,
      actor,
      metadata: { from: opportunity.status, to },
    },
  });
}

export interface OpportunityFilters {
  status?: OpportunityStatus[];
  minScore?: number;
  city?: string;
  artistName?: string;
  hasContact?: boolean;
}

export async function listOpportunities(filters: OpportunityFilters, limit = 25, cursor?: string) {
  const where: Prisma.OpportunityWhereInput = {
    status: filters.status ? { in: filters.status } : undefined,
    score: filters.minScore ? { gte: filters.minScore } : undefined,
    primaryContactId: filters.hasContact === undefined ? undefined : filters.hasContact ? { not: null } : null,
    event: {
      venueCity: filters.city ? { equals: filters.city, mode: "insensitive" } : undefined,
      artistName: filters.artistName ? { contains: filters.artistName, mode: "insensitive" } : undefined,
    },
  };

  const items = await prisma.opportunity.findMany({
    where,
    include: { event: true, primaryContact: true, organization: true },
    orderBy: { score: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getOpportunityDetail(id: string) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      event: { include: { artist: true, venue: true } },
      organization: true,
      primaryContact: true,
      emailDrafts: { include: { versions: true, outreach: true, contact: true } },
      outreach: true,
      followups: true,
      activityLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!opportunity) throw new NotFoundError("Opportunity", id);
  return opportunity;
}

export async function getStatistics() {
  const [byStatus, drafted, awaitingApproval, sentThisWeek, followupsDue] = await Promise.all([
    prisma.opportunity.groupBy({ by: ["status"], _count: true }),
    prisma.emailDraft.count({ where: { status: "draft" } }),
    prisma.emailDraft.count({ where: { status: { in: ["draft", "edited"] } } }),
    prisma.outreach.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.followup.count({ where: { status: "scheduled", scheduledFor: { lte: new Date() } } }),
  ]);

  return {
    byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count])),
    draftedCount: drafted,
    awaitingApprovalCount: awaitingApproval,
    sentThisWeek,
    followupsDue,
  };
}
