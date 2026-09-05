import { prisma } from "@photography-outreach/database";
import type { Prisma } from "@photography-outreach/database";
import { NotFoundError } from "@photography-outreach/shared";

export interface EventFilters {
  city?: string;
  artistName?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export async function searchEvents(filters: EventFilters, limit = 25, cursor?: string) {
  const where: Prisma.EventWhereInput = {
    venueCity: filters.city ? { equals: filters.city, mode: "insensitive" } : undefined,
    artistName: filters.artistName ? { contains: filters.artistName, mode: "insensitive" } : undefined,
    startsAt:
      filters.dateFrom || filters.dateTo
        ? { gte: filters.dateFrom, lte: filters.dateTo }
        : undefined,
  };

  const items = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getEvent(id: string) {
  const event = await prisma.event.findUnique({ where: { id }, include: { artist: true, venue: true } });
  if (!event) throw new NotFoundError("Event", id);
  return event;
}
